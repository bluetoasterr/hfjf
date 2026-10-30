import { storage } from "@vendetta/plugin";
import Settings from "./Settings";
import { installPatches, removePatches } from "./patches";

export default {
    onLoad() {
        storage.enabled ??= true;
        storage.start ??= "#ff66cc";
        storage.end ??= "#9966ff";
        storage.showIcon ??= true;
        storage.icon ??= "✦";
        storage.iconColor ??= "#ffffff";
        storage.emojiId ??= "";
        storage.keepEmojiColors ??= true;
        installPatches();
    },
    onUnload() {
        removePatches();
    },
    settings: Settings,
};
