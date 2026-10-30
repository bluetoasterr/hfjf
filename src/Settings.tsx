import { React, ReactNative } from "@vendetta/metro/common";
import { findByStoreName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { config, isHex, StyledName, hasSmoothGradient } from "./appearance";
import { diagnostics } from "./patches";

const RN: any = ReactNative;

function previewName() {
    try {
        const users: any = findByStoreName("UserStore");
        const me = users?.getCurrentUser?.();
        return me?.globalName ?? me?.global_name ?? me?.username ?? "Your username";
    } catch {
        return "Your username";
    }
}

export default function Settings() {
    const [, refresh] = React.useReducer((n: number) => n + 1, 0);
    const prefs = config();
    const update = (key: string, value: any) => {
        storage[key] = value;
        refresh();
    };
    const field = (title: string, key: string, placeholder: string, note?: string) =>
        <RN.View style={{ marginBottom: 15 }}>
            <RN.Text style={{ color: "#ffffff", fontSize: 14, marginBottom: 5 }}>{title}</RN.Text>
            <RN.TextInput
                value={String(storage[key] ?? "")}
                placeholder={placeholder}
                placeholderTextColor="#999999"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(value: string) => update(key, value)}
                style={{ padding: 10, color: "#ffffff", borderRadius: 8, backgroundColor: "#36363f" }}
            />
            {!!note && <RN.Text style={{ color: "#aaaaaa", fontSize: 12, marginTop: 4 }}>{note}</RN.Text>}
        </RN.View>;
    const toggle = (name: string, key: string) => <RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <RN.Text style={{ color: "#ffffff", flex: 1 }}>{name}</RN.Text>
        <RN.Switch value={storage[key] !== false} onValueChange={(value: boolean) => update(key, value)} />
    </RN.View>;

    return <RN.ScrollView contentContainerStyle={{ padding: 16 }}>
        <RN.Text style={{ color: "#ffffff", fontSize: 19, fontWeight: "700", marginBottom: 6 }}>Global Role Style</RN.Text>
        <RN.Text style={{ color: "#aaaaaa", marginBottom: 18 }}>Local-only Discord-style two-color gradient and role icon for your username.</RN.Text>
        {toggle("Enable custom appearance", "enabled")}
        {field("Gradient: primary color", "start", "#ff66cc")}
        {field("Gradient: secondary color", "end", "#9966ff")}
        {!isHex(storage.start) || !isHex(storage.end) ?
            <RN.Text style={{ color: "#ffac7a", marginBottom: 12 }}>Use six-digit hex colors, like #ff66cc.</RN.Text> : null}
        {toggle("Display role icon", "showIcon")}
        {field("Custom server emoji", "emojiId", "<:name:123456789012345678>", "Accepts an emoji ID, <:name:id>, <a:name:id> or Discord CDN URL.")}
        {field("Fallback icon (emoji or text symbol)", "icon", "✦")}
        {field("Icon color", "iconColor", "#ffffff", "The icon color applies to text symbols, not full-color server emojis unless tinting is enabled.")}
        {toggle("Keep emoji's original colors", "keepEmojiColors")}
        <RN.View style={{ padding: 14, borderRadius: 10, backgroundColor: "#26262e", marginVertical: 12 }}>
            <RN.Text style={{ color: "#999999", marginBottom: 10 }}>Preview</RN.Text>
            <StyledName text={previewName()} textProps={{ style: { fontSize: 18, fontWeight: "700", color: "#ffffff" } }} />
        </RN.View>
        <RN.Text style={{ color: "#bbbbbb", fontSize: 12, marginBottom: 8 }}>
            Renderer: {hasSmoothGradient() ? "smooth masked SVG gradient available" : "native gradient components not found; using primary color fallback"}
        </RN.Text>
        <RN.Text style={{ color: "#bbbbbb", fontSize: 12, marginBottom: 8 }}>
            Discord hooks: DisplayName {diagnostics.displayNameFound ? "found" : "not found"}; GuildMemberStore {diagnostics.memberStoreFound ? "found" : "not found"}; UserStore {diagnostics.userStoreFound ? "found" : "not detected yet"}.
        </RN.Text>
        <RN.Text style={{ color: "#bbbbbb", fontSize: 12 }}>
            Name replacements: {diagnostics.namePatches}; member lookups: {diagnostics.memberPatches}. Changes may require reopening a server. This version targets React-rendered names; some native chat rows and member lists may not use those components.
        </RN.Text>
    </RN.ScrollView>;
}
