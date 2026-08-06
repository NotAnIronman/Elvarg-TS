import { createHash } from "crypto";

export type ServerDataDocumentKind = "array" | "object";

export interface ServerDataProvider {
  documentKind: ServerDataDocumentKind;
  entryKey?: string;
  read(): unknown | Promise<unknown>;
  replace?(document: unknown): unknown | Promise<unknown>;
  create?(entry: unknown): unknown | Promise<unknown>;
}

export interface ServerDataResourceSummary {
  name: string;
  owner: string;
  documentKind: ServerDataDocumentKind;
  entryKey?: string;
  canReplace: boolean;
  canCreate: boolean;
  supportsEntryRoutes: boolean;
}

export interface ServerDataReadResult {
  payload: unknown;
  etag: string;
}

export interface ServerDataWriteResult extends ServerDataReadResult {
  status: 200 | 201;
  entryId?: string;
}

export class ServerDataError extends Error {
  public constructor(public readonly status: number, message: string) {
    super(message);
  }
}

interface RegisteredServerDataProvider {
  owner: string;
  provider: ServerDataProvider;
}

type JsonObject = Record<string, unknown>;
type JsonDocument = unknown[] | JsonObject;

export class ServerDataRegistry {
  private static readonly providers = new Map<
    string,
    RegisteredServerDataProvider
  >();
  private static readonly writeQueues = new Map<string, Promise<void>>();

  public static register(
    name: string,
    owner: string,
    provider: ServerDataProvider
  ): void {
    const normalizedName = this.normalizeName(name);
    const normalizedOwner = String(owner || "").trim();
    if (!normalizedOwner) {
      throw new Error(`Server data resource ${normalizedName} requires an owner`);
    }
    this.validateProvider(normalizedName, provider);
    const existing = this.providers.get(normalizedName);
    if (existing && existing.owner !== normalizedOwner) {
      throw new Error(
        `Server data resource ${normalizedName} is already owned by ${existing.owner}`
      );
    }
    this.providers.set(normalizedName, { owner: normalizedOwner, provider });
    console.info(
      `[server-data] registered ${normalizedName} (${normalizedOwner})`
    );
  }

  public static list(): ServerDataResourceSummary[] {
    return Array.from(this.providers.entries())
      .map(([name, registration]) => {
        const { owner, provider } = registration;
        return {
          name,
          owner,
          documentKind: provider.documentKind,
          ...(provider.entryKey ? { entryKey: provider.entryKey } : {}),
          canReplace: typeof provider.replace === "function",
          canCreate:
            typeof provider.create === "function" ||
            typeof provider.replace === "function",
          supportsEntryRoutes:
            provider.documentKind === "object" || Boolean(provider.entryKey),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  public static async read(
    name: string,
    entryId: string | null = null
  ): Promise<ServerDataReadResult> {
    const registration = this.requireRegistration(name);
    const document = await this.readDocument(name, registration.provider);
    const payload =
      entryId === null
        ? document
        : this.getEntry(registration.provider, document, entryId);
    return { payload, etag: this.createEtag(document) };
  }

  public static async put(
    name: string,
    entryId: string | null,
    payload: unknown,
    ifMatch?: string
  ): Promise<ServerDataWriteResult> {
    const registration = this.requireRegistration(name);
    const provider = registration.provider;
    if (typeof provider.replace !== "function") {
      throw new ServerDataError(405, `Server data resource ${name} is read-only`);
    }
    return this.withWriteLock(name, async () => {
      const current = await this.readDocument(name, provider);
      this.checkIfMatch(ifMatch, this.createEtag(current));
      const existed =
        entryId === null || this.hasEntry(provider, current, entryId);
      const next =
        entryId === null
          ? this.asDocument(name, provider, payload, 400)
          : this.putEntry(provider, current, entryId, payload);
      await provider.replace!(next);
      const saved = await this.readDocument(name, provider);
      return {
        status: existed ? 200 : 201,
        payload:
          entryId === null ? saved : this.getEntry(provider, saved, entryId),
        etag: this.createEtag(saved),
        ...(entryId === null ? {} : { entryId }),
      };
    });
  }

  public static async post(
    name: string,
    payload: unknown,
    ifMatch?: string
  ): Promise<ServerDataWriteResult> {
    const registration = this.requireRegistration(name);
    const provider = registration.provider;
    if (
      typeof provider.create !== "function" &&
      typeof provider.replace !== "function"
    ) {
      throw new ServerDataError(405, `Server data resource ${name} is read-only`);
    }
    return this.withWriteLock(name, async () => {
      const current = await this.readDocument(name, provider);
      this.checkIfMatch(ifMatch, this.createEtag(current));
      let entryId: string | undefined;
      let created = payload;
      if (provider.create) {
        created = (await provider.create(payload)) ?? payload;
        entryId = this.entryId(provider, created);
      } else {
        const appended = this.appendEntry(provider, current, payload);
        entryId = appended.entryId;
        await provider.replace!(appended.document);
      }
      const saved = await this.readDocument(name, provider);
      if (entryId && (provider.documentKind === "object" || provider.entryKey)) {
        created = this.getEntry(provider, saved, entryId);
      }
      return {
        status: 201,
        payload: created,
        etag: this.createEtag(saved),
        ...(entryId ? { entryId } : {}),
      };
    });
  }

  private static requireRegistration(
    name: string
  ): RegisteredServerDataProvider {
    const normalizedName = this.normalizeName(name);
    const registration = this.providers.get(normalizedName);
    if (!registration) {
      throw new ServerDataError(
        404,
        `Unknown server data resource: ${normalizedName}`
      );
    }
    return registration;
  }

  private static async readDocument(
    name: string,
    provider: ServerDataProvider
  ): Promise<JsonDocument> {
    const document = await provider.read();
    return this.asDocument(name, provider, document);
  }

  private static asDocument(
    name: string,
    provider: ServerDataProvider,
    value: unknown,
    invalidStatus = 500
  ): JsonDocument {
    if (provider.documentKind === "array" && Array.isArray(value)) {
      return value;
    }
    if (provider.documentKind === "object" && isJsonObject(value)) {
      return value;
    }
    throw new ServerDataError(
      invalidStatus,
      invalidStatus === 400
        ? `Server data resource ${name} requires a ${provider.documentKind} document`
        : `Server data provider ${name} returned a non-${provider.documentKind} document`
    );
  }

  private static getEntry(
    provider: ServerDataProvider,
    document: JsonDocument,
    entryId: string
  ): unknown {
    if (Array.isArray(document)) {
      if (!provider.entryKey) {
        throw new ServerDataError(
          405,
          "This resource does not support individual entry routes"
        );
      }
      const entry = document.find(
        (value) =>
          isJsonObject(value) &&
          String(value[provider.entryKey!]) === entryId
      );
      if (entry === undefined) {
        throw new ServerDataError(404, `Entry ${entryId} was not found`);
      }
      return entry;
    }
    if (!Object.prototype.hasOwnProperty.call(document, entryId)) {
      throw new ServerDataError(404, `Entry ${entryId} was not found`);
    }
    return document[entryId];
  }

  private static hasEntry(
    provider: ServerDataProvider,
    document: JsonDocument,
    entryId: string
  ): boolean {
    try {
      this.getEntry(provider, document, entryId);
      return true;
    } catch (error) {
      if (error instanceof ServerDataError && error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  private static putEntry(
    provider: ServerDataProvider,
    document: JsonDocument,
    entryId: string,
    payload: unknown
  ): JsonDocument {
    if (Array.isArray(document)) {
      if (!provider.entryKey || !isJsonObject(payload)) {
        throw new ServerDataError(400, "This entry must be a JSON object");
      }
      if (String(payload[provider.entryKey]) !== entryId) {
        throw new ServerDataError(
          400,
          `${provider.entryKey} must match the entry URL`
        );
      }
      const next = [...document];
      const index = next.findIndex(
        (value) =>
          isJsonObject(value) &&
          String(value[provider.entryKey!]) === entryId
      );
      if (index >= 0) {
        next[index] = payload;
      } else {
        next.push(payload);
      }
      return next;
    }
    return { ...document, [entryId]: payload };
  }

  private static appendEntry(
    provider: ServerDataProvider,
    document: JsonDocument,
    payload: unknown
  ): { document: JsonDocument; entryId?: string } {
    if (Array.isArray(document)) {
      if (!isJsonObject(payload)) {
        throw new ServerDataError(400, "POST payload must be a JSON object");
      }
      const entryId = this.entryId(provider, payload);
      if (entryId && this.hasEntry(provider, document, entryId)) {
        throw new ServerDataError(
          409,
          `${provider.entryKey} already exists`
        );
      }
      return { document: [...document, payload], ...(entryId ? { entryId } : {}) };
    }
    if (
      !isJsonObject(payload) ||
      typeof payload.key !== "string" ||
      !payload.key.trim() ||
      !("value" in payload)
    ) {
      throw new ServerDataError(
        400,
        'POST payload for object resources must be { "key": string, "value": any }'
      );
    }
    const entryId = payload.key.trim();
    if (Object.prototype.hasOwnProperty.call(document, entryId)) {
      throw new ServerDataError(409, `Entry ${entryId} already exists`);
    }
    return {
      document: { ...document, [entryId]: payload.value },
      entryId,
    };
  }

  private static entryId(
    provider: ServerDataProvider,
    entry: unknown
  ): string | undefined {
    if (!provider.entryKey || !isJsonObject(entry)) {
      return undefined;
    }
    const value = entry[provider.entryKey];
    return value == null ? undefined : String(value);
  }

  private static checkIfMatch(
    ifMatch: string | undefined,
    currentEtag: string
  ): void {
    if (ifMatch && ifMatch !== "*" && ifMatch !== currentEtag) {
      throw new ServerDataError(
        412,
        "Server data changed since it was loaded; reload it before saving"
      );
    }
  }

  private static async withWriteLock<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.writeQueues.get(name) || Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(
      () => undefined,
      () => undefined
    );
    this.writeQueues.set(name, tail);
    try {
      return await current;
    } finally {
      if (this.writeQueues.get(name) === tail) {
        this.writeQueues.delete(name);
      }
    }
  }

  private static normalizeName(name: string): string {
    const normalized = String(name || "").trim();
    if (!/^[a-z][a-z0-9_-]*$/.test(normalized)) {
      throw new Error(`Invalid server data resource name: ${String(name)}`);
    }
    return normalized;
  }

  private static validateProvider(
    name: string,
    provider: ServerDataProvider
  ): void {
    if (
      !provider ||
      (provider.documentKind !== "array" &&
        provider.documentKind !== "object") ||
      typeof provider.read !== "function"
    ) {
      throw new Error(`Invalid server data provider for ${name}`);
    }
    if (
      provider.entryKey != null &&
      (provider.documentKind !== "array" ||
        typeof provider.entryKey !== "string" ||
        !provider.entryKey.trim())
    ) {
      throw new Error(`Invalid entryKey for server data resource ${name}`);
    }
  }

  private static createEtag(document: JsonDocument): string {
    return `"${createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex")}"`;
  }
}

const isJsonObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
