import cors from "@fastify/cors";
import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import {
  ServerDataError,
  ServerDataRegistry,
} from "../../game/data/ServerDataRegistry";
import { NpcSpawnDefinition } from "../../game/definition/NpcSpawnDefinition";
import { NpcInteractionManager } from "../../game/entity/impl/npc/NpcInteractionManager";
import { ShopDefinition } from "../../game/definition/ShopDefinition";
import { NetworkConstants } from "../NetworkConstants";

interface ResourceParams {
  resourceName: string;
}

interface ResourceEntryParams extends ResourceParams {
  entryId: string;
}

const API_PREFIX = "/dev-api";
const DEFAULT_BODY_LIMIT_BYTES = 20 * 1024 * 1024;
const LOCAL_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export class DevelopmentApiServer {
  private static instance: FastifyInstance | null = null;
  private static startPromise: Promise<void> | null = null;

  public static start(): FastifyInstance | null {
    if (this.instance) {
      return this.instance;
    }
    const port = NetworkConstants.DEVELOPMENT_API_PORT;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      console.error(
        `[dev-api] not started: invalid DEVELOPMENT_API_PORT ${String(port)}`
      );
      return null;
    }
    const host = process.env.DEVELOPMENT_API_HOST?.trim() || "127.0.0.1";
    const configuredLimit = Number.parseInt(
      process.env.DEVELOPMENT_API_MAX_BODY_BYTES || "",
      10
    );
    const bodyLimit =
      Number.isInteger(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : DEFAULT_BODY_LIMIT_BYTES;
    const instance = Fastify({ bodyLimit, logger: false });
    this.instance = instance;
    this.startPromise = this.configureAndListen(instance, host, port).catch(
      async (error) => {
        console.error("[dev-api] failed to start", error);
        if (this.instance === instance) {
          this.instance = null;
        }
        await instance.close().catch(() => undefined);
      }
    );
    return instance;
  }

  public static async stop(): Promise<void> {
    const instance = this.instance;
    const startPromise = this.startPromise;
    this.instance = null;
    this.startPromise = null;
    await startPromise?.catch(() => undefined);
    await instance
      ?.close()
      .catch((error) =>
        console.warn("[dev-api] failed to close cleanly", error)
      );
  }

  private static async configureAndListen(
    instance: FastifyInstance,
    host: string,
    port: number
  ): Promise<void> {
    await instance.register(cors, {
      origin: (origin, callback) =>
        callback(null, this.isAllowedOrigin(origin)),
      methods: ["GET", "PUT", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "If-Match", "If-None-Match"],
      exposedHeaders: ["ETag", "Location"],
      maxAge: 600,
    });

    instance.addHook("onRequest", async (request) => {
      const origin = request.headers.origin;
      if (origin && !this.isAllowedOrigin(origin)) {
        throw new ServerDataError(
          403,
          "Origin is not allowed by the development API"
        );
      }
      if (request.method === "PUT" || request.method === "POST") {
        const contentType = String(
          request.headers["content-type"] || ""
        ).toLowerCase();
        if (!contentType.startsWith("application/json")) {
          throw new ServerDataError(
            415,
            "Content-Type must be application/json"
          );
        }
      }
    });

    instance.setNotFoundHandler((_request, reply) => {
      void reply.code(404).send({ error: "Not found" });
    });
    instance.setErrorHandler((error, _request, reply) => {
      const fastifyError = error as {
        statusCode?: number;
        message?: string;
      };
      const status =
        error instanceof ServerDataError
          ? error.status
          : Number(fastifyError.statusCode) || 500;
      if (status >= 500) {
        console.error("[dev-api] request failed", error);
      }
      void reply
        .code(status)
        .send({ error: fastifyError.message || "Unexpected API error" });
    });

    instance.get(API_PREFIX, async () => ({
      development: true,
      dataUrl: `${API_PREFIX}/data`,
    }));
    instance.get("/npc_spawns", async (_request, reply) => {
      const spawns = NpcSpawnDefinition.all().map((definition) => {
        const position = definition.getPosition();
        const radius = definition.getRadius();
        return {
          id: definition.getId(),
          position: {
            x: position.getX(),
            y: position.getY(),
            z: position.getZ(),
          },
          facing: definition.getFacing().getId(),
          source: definition.getSource(),
          ...(radius == null ? {} : { radius }),
        };
      });
      return reply.header("Cache-Control", "no-cache").send(spawns);
    });
    instance.get("/npc_interactions", async (_request, reply) =>
      reply
        .header("Cache-Control", "no-cache")
        .send(NpcInteractionManager.all())
    );
    instance.get("/shops", async (_request, reply) => {
      const shops = ShopDefinition.all().map((definition) => ({
        id: definition.getId(),
        name: definition.getName(),
        currency: definition.getCurrency(),
        source: definition.getSource(),
        originalStock: definition.getOriginalStock().map((item) => ({
          id: item.id,
          amount: item.amount,
          ...(item.price == null ? {} : { price: item.price }),
          ...(item.restockTicks == null
            ? {}
            : { restockTicks: item.restockTicks }),
        })),
      }));
      return reply.header("Cache-Control", "no-cache").send(shops);
    });
    instance.get(`${API_PREFIX}/data`, async () => ServerDataRegistry.list());
    instance.get<{ Params: ResourceParams }>(
      `${API_PREFIX}/data/:resourceName`,
      async (request, reply) =>
        this.sendReadResult(
          request,
          reply,
          await ServerDataRegistry.read(request.params.resourceName)
        )
    );
    instance.get<{ Params: ResourceEntryParams }>(
      `${API_PREFIX}/data/:resourceName/:entryId`,
      async (request, reply) =>
        this.sendReadResult(
          request,
          reply,
          await ServerDataRegistry.read(
            request.params.resourceName,
            request.params.entryId
          )
        )
    );
    instance.put<{ Params: ResourceParams; Body: unknown }>(
      `${API_PREFIX}/data/:resourceName`,
      async (request, reply) => {
        const result = await ServerDataRegistry.put(
          request.params.resourceName,
          null,
          request.body,
          this.headerValue(request, "if-match")
        );
        return reply
          .header("ETag", result.etag)
          .header("Cache-Control", "no-cache")
          .code(result.status)
          .send(result.payload);
      }
    );
    instance.put<{ Params: ResourceEntryParams; Body: unknown }>(
      `${API_PREFIX}/data/:resourceName/:entryId`,
      async (request, reply) => {
        const result = await ServerDataRegistry.put(
          request.params.resourceName,
          request.params.entryId,
          request.body,
          this.headerValue(request, "if-match")
        );
        return reply
          .header("ETag", result.etag)
          .header("Cache-Control", "no-cache")
          .code(result.status)
          .send(result.payload);
      }
    );
    instance.post<{ Params: ResourceParams; Body: unknown }>(
      `${API_PREFIX}/data/:resourceName`,
      async (request, reply) => {
        const resourceName = request.params.resourceName;
        const result = await ServerDataRegistry.post(
          resourceName,
          request.body,
          this.headerValue(request, "if-match")
        );
        const location = result.entryId
          ? `${API_PREFIX}/data/${encodeURIComponent(
              resourceName
            )}/${encodeURIComponent(result.entryId)}`
          : `${API_PREFIX}/data/${encodeURIComponent(resourceName)}`;
        return reply
          .header("ETag", result.etag)
          .header("Location", location)
          .header("Cache-Control", "no-cache")
          .code(201)
          .send(result.payload);
      }
    );

    const address = await instance.listen({ host, port });
    console.info(`[dev-api] listening on ${address}${API_PREFIX}`);
  }

  private static sendReadResult(
    request: FastifyRequest,
    reply: FastifyReply,
    result: { payload: unknown; etag: string }
  ): FastifyReply {
    if (this.headerValue(request, "if-none-match") === result.etag) {
      return reply
        .header("ETag", result.etag)
        .header("Cache-Control", "no-cache")
        .code(304)
        .send();
    }
    return reply
      .header("ETag", result.etag)
      .header("Cache-Control", "no-cache")
      .send(result.payload);
  }

  private static headerValue(
    request: FastifyRequest,
    name: "if-match" | "if-none-match"
  ): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private static isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin || LOCAL_ORIGIN.test(origin)) {
      return true;
    }
    return (process.env.DEVELOPMENT_API_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .includes(origin);
  }
}
