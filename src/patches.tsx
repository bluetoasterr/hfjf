import { React, ReactNative } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import { config, hexAsInt, StyledName } from "./appearance";

const RN: any = ReactNative;
const ReactAny: any = React;
const patches: Array<() => void> = [];
let cachedUserStore: any = null;

export const diagnostics = {
    namePatches: 0,
    memberPatches: 0,
    displayNameFound: false,
    memberStoreFound: false,
    userStoreFound: false,
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

function isTextType(type: any) {
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
            return ReactAny.createElement(StyledName, {
                text: child, textProps, nested: parentIsText,
            });
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
    const self = () => currentUserId();

    try {
        const DisplayNames: any = findByProps("DisplayName");
        if (typeof DisplayNames?.DisplayName === "function") {
            diagnostics.displayNameFound = true;
            patches.push(after("DisplayName", DisplayNames, ([props]: any[], result: any) => {
                try {
                    if (!config().enabled) return;
                    const me = self();
                    const userId = props?.user?.id ?? props?.userId ?? props?.member?.userId;
                    if (!me || String(userId) !== String(me)) return;
                    const names = candidateNames(props);
                    if (!names.size) return;
                    return replaceOneName(result, names);
                } catch {
                    // A changed Discord component should never break the name list.
                }
            }));
        }
    } catch {
        diagnostics.displayNameFound = false;
    }

    try {
        const members: any = findByStoreName("GuildMemberStore");
        if (typeof members?.getMember === "function") {
            diagnostics.memberStoreFound = true;
            patches.push(after("getMember", members, (args: any[], original: any) => {
                try {
                    const userId = args?.[1];
                    const me = self();
                    const prefs = config();
                    if (!prefs.enabled || !original || !me || String(userId) !== String(me)) return;
                    diagnostics.memberPatches++;
                    const primary = hexAsInt(prefs.start);
                    const secondary = hexAsInt(prefs.end);
                    // These are local-only overrides of the current user's member data.
                    // The color keys follow Discord's API, but Discord 305.1 PTB may use
                    // different internal names; the React name patch handles that surface.
                    return {
                        ...original,
                        color: primary,
                        colorString: prefs.start,
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
                } catch {
                    return;
                }
            }));
        }
    } catch {
        diagnostics.memberStoreFound = false;
    }
}

export function removePatches() {
    while (patches.length) {
        try { patches.pop()?.(); } catch { /* best effort */ }
    }
}
