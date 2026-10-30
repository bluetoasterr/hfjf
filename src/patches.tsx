import { React, ReactNative } from "@vendetta/metro/common";
import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { after, before } from "@vendetta/patcher";
import { config, emojiId, hexAsInt, StyledName } from "./appearance";

const RN: any = ReactNative;
const ReactAny: any = React;
const patches: Array<() => void> = [];
let cachedUserStore: any = null;
let retryTimer: any = null;
let rowManagerPatched = false;
const patchedBridges = new Set<any>();

export const diagnostics = {
    namePatches: 0,
    memberPatches: 0,
    nativeRowsPatched: 0,
    nativeGradientsPatched: 0,
    nativeIconsPatched: 0,
    displayNameFound: false,
    memberStoreFound: false,
    userStoreFound: false,
    rowManagerFound: false,
    chatBridgeFound: false,
    lastNativePath: "not detected",
    lastError: "",
};

function currentUserId(): string | null {
    try {
        const users: any = cachedUserStore ?? (cachedUserStore = findByStoreName("UserStore"));
        diagnostics.userStoreFound = !!users;
        return users?.getCurrentUser?.()?.id ?? null;
    } catch {
        return null;
    }
}

function nativeColor(hex: string): number {
    try {
        const processed = RN.processColor?.(hex);
        if (typeof processed === "number") return processed;
    } catch { /* fallback below */ }
    // React Native expects the resulting ARGB value, not a bare RGB integer.
    return (0xff000000 | hexAsInt(hex)) >>> 0;
}

function iconData(): any {
    const prefs = config();
    if (!prefs.showIcon) return null;
    const id = emojiId(prefs.emojiId);
    if (id) {
        // The native chat roleIcon object uses `source`, not React Native's `uri`.
        const url = `https://cdn.discordapp.com/emojis/${id}.png?size=48`;
        return {
            source: url,
            name: "Custom role icon",
            size: 18,
            unicodeEmoji: null,
            alt: "Custom role icon",
        };
    }
    if (prefs.icon) {
        return {
            source: null,
            name: "Custom role icon",
            size: 18,
            unicodeEmoji: prefs.icon,
            alt: prefs.icon,
        };
    }
    return null;
}

function styleNativeMessage(message: any, source: string): boolean {
    if (!message || typeof message !== "object" || !config().enabled) return false;
    const me = currentUserId();
    if (!me) return false;
    const author = message.authorId ?? message.author_id ?? message.author?.id;
    if (author == null || String(author) !== String(me)) return false;

    const prefs = config();
    const first = nativeColor(prefs.start);
    const second = nativeColor(prefs.end);

    // Discord's *native chat renderer* consumes these particular message fields.
    // An existing enhanced/gradient role can otherwise take priority over `colorString`.
    message.roleColors = {
        primaryColor: first,
        secondaryColor: second,
        tertiaryColor: null,
    };
    message.roleColor = null;
    message.usernameColor = null;
    message.colorString = first;
    message.shouldShowRoleOnName = true;
    message.shouldShowRoleDot = false;
    diagnostics.nativeGradientsPatched++;

    // Discord renders role icons from this field; GuildMemberStore has no icon slot.
    message.roleIcon = iconData();
    if (message.roleIcon) diagnostics.nativeIconsPatched++;
    diagnostics.nativeRowsPatched++;
    diagnostics.lastNativePath = source;
    return true;
}

function styleNativeRow(row: any, source: string): void {
    if (!row || typeof row !== "object") return;
    // `row.message` may be the actual message row or a referenced message row.
    const msg = row.message ?? (row.authorId ? row : null);
    if (!msg) return;
    styleNativeMessage(msg, source);
    const ref = msg.referencedMessage?.message;
    if (ref) styleNativeMessage(ref, source);
}

function patchNativeRows(): void {
    try {
        const RowManager: any = findByName("RowManager") ?? findByName("RowManager", false);
        const klass = RowManager?.default ?? RowManager;
        if (!rowManagerPatched && klass?.prototype?.generate) {
            patches.push(after("generate", klass.prototype, (_args: any[], result: any) => {
                try { styleNativeRow(result, "RowManager.generate"); }
                catch (e) { diagnostics.lastError = String(e); }
            }));
            rowManagerPatched = true;
            diagnostics.rowManagerFound = true;
        }
    } catch (e) { diagnostics.lastError = String(e); }

    try {
        const modules: any = RN.NativeModules ?? {};
        const candidates = [modules.DCDChatManager, modules.ChatModule];
        for (const bridge of candidates) {
            if (!bridge?.updateRows || patchedBridges.has(bridge)) continue;
            patches.push(before("updateRows", bridge, (args: any[]) => {
                try {
                    const original = args?.[1];
                    if (typeof original !== "string") return;
                    const parsed = JSON.parse(original);
                    const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
                    if (!Array.isArray(rows)) return;
                    for (const row of rows) styleNativeRow(row, "ChatModule.updateRows");
                    args[1] = JSON.stringify(parsed);
                } catch (e) { diagnostics.lastError = String(e); }
            }));
            patchedBridges.add(bridge);
            diagnostics.chatBridgeFound = true;
        }
    } catch (e) { diagnostics.lastError = String(e); }
}

function isTextType(type: any): boolean {
    return type === RN.Text || type?.displayName === "Text" || type?.name === "Text";
}

function candidateNames(props: any): Set<string> {
    const names = [
        props?.user?.username, props?.user?.globalName, props?.user?.global_name,
        props?.user?.displayName, props?.displayName, props?.nickname, props?.nick,
        props?.member?.nick, props?.guildMember?.nick, props?.name,
    ];
    return new Set(names.filter((name) => typeof name === "string" && name.length > 0));
}

function replaceOneName(tree: any, names: Set<string>, isNested = false): any {
    let used = false;
    const visit = (node: any, parentIsText: boolean, depth: number): any => {
        if (depth > 35 || node == null) return node;
        if (Array.isArray(node)) return node.map((child) => visit(child, parentIsText, depth + 1));
        if (!ReactAny.isValidElement?.(node)) return node;
        const originalProps: any = node.props ?? {};
        const child = originalProps.children;
        const textNode = isTextType(node.type);
        if (!used && textNode && typeof child === "string" && names.has(child)) {
            used = true;
            const textProps = { ...originalProps };
            delete textProps.children;
            delete textProps.ref;
            delete textProps.key;
            return ReactAny.createElement(StyledName, { text: child, textProps, nested: parentIsText });
        }
        if (child == null) return node;
        const next = visit(child, parentIsText || textNode, depth + 1);
        if (next === child) return node;
        return ReactAny.cloneElement(node, { children: next });
    };
    const result = visit(tree, isNested, 0);
    if (used) diagnostics.namePatches++;
    return result;
}

export function installPatches() {
    diagnostics.namePatches = 0;
    diagnostics.memberPatches = 0;
    diagnostics.nativeRowsPatched = 0;
    diagnostics.nativeGradientsPatched = 0;
    diagnostics.nativeIconsPatched = 0;
    diagnostics.lastError = "";

    try {
        const DisplayNames: any = findByProps("DisplayName");
        if (typeof DisplayNames?.DisplayName === "function") {
            diagnostics.displayNameFound = true;
            patches.push(after("DisplayName", DisplayNames, ([props]: any[], result: any) => {
                try {
                    if (!config().enabled) return;
                    const me = currentUserId();
                    const userId = props?.user?.id ?? props?.userId ?? props?.member?.userId;
                    if (!me || String(userId) !== String(me)) return;
                    const names = candidateNames(props);
                    if (!names.size) return;
                    return replaceOneName(result, names);
                } catch { /* preserve Discord UI */ }
            }));
        }
    } catch { diagnostics.displayNameFound = false; }

    try {
        const members: any = findByStoreName("GuildMemberStore");
        if (typeof members?.getMember === "function") {
            diagnostics.memberStoreFound = true;
            patches.push(after("getMember", members, (args: any[], original: any) => {
                try {
                    const userId = args?.[1];
                    const me = currentUserId();
                    const prefs = config();
                    if (!prefs.enabled || !original || !me || String(userId) !== String(me)) return;
                    diagnostics.memberPatches++;
                    const primary = hexAsInt(prefs.start);
                    const secondary = hexAsInt(prefs.end);
                    return {
                        ...original,
                        color: primary,
                        colorString: prefs.start,
                        // EnhancedRoleColorUtils reads `colorStrings` while other
                        // consumers read `colors` or `colorString`.
                        colorStrings: {
                            ...original.colorStrings,
                            primaryColor: prefs.start,
                            secondaryColor: prefs.end,
                            tertiaryColor: null,
                        },
                        colors: {
                            ...original.colors,
                            primary_color: primary,
                            secondary_color: secondary,
                            tertiary_color: null,
                            primaryColor: primary,
                            secondaryColor: secondary,
                            tertiaryColor: null,
                        },
                    };
                } catch { return; }
            }));
        }
    } catch { diagnostics.memberStoreFound = false; }

    patchNativeRows();
    // Some of Discord's Metro modules load only after a channel is opened.
    let tries = 0;
    retryTimer = setInterval(() => {
        if (rowManagerPatched && diagnostics.chatBridgeFound || ++tries >= 25) {
            clearInterval(retryTimer);
            retryTimer = null;
            return;
        }
        patchNativeRows();
    }, 1300);
}

export function removePatches() {
    if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    while (patches.length) {
        try { patches.pop()?.(); } catch { /* best effort */ }
    }
    rowManagerPatched = false;
    patchedBridges.clear();
}
