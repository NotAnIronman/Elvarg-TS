import { DialogueOption } from "./DialogueOption";
import { Player } from "../../entity/impl/player/Player";

export interface DialogueOptionAction {
    executeOption(option: DialogueOption, player?: Player): void;
}
