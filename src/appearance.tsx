import { React, ReactNative } from "@vendetta/metro/common";
import { findByProps, findByName } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";

const RN: any = ReactNative;

export function isHex(value: unknown): boolean {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

export function config() {
    return {
        enabled: storage.enabled !== false,
        start: isHex(storage.start) ? String(storage.start) : "#ff66cc",
        end: isHex(storage.end) ? String(storage.end) : "#9966ff",
        icon: typeof storage.icon === "string" ? storage.icon : "✦",
        iconColor: isHex(storage.iconColor) ? String(storage.iconColor) : "#ffffff",
        emojiId: String(storage.emojiId ?? ""),
        emojiTint: storage.keepEmojiColors === false,
        showIcon: storage.showIcon !== false,
    };
}

export function emojiId(input: string): string {
    const value = input.trim();
    const match = value.match(/^<a?:[a-zA-Z0-9_]+:(\d{15,22})>$/)
        ?? value.match(/^(\d{15,22})$/)
        ?? value.match(/^https:\/\/cdn\.discordapp\.com\/emojis\/(\d{15,22})\.(?:png|webp|gif)(?:\?.*)?$/i);
    return match?.[1] ?? "";
}

export function hexAsInt(hex: string) {
    return Number.parseInt(hex.slice(1), 16) || 1;
}

let gradientComponents: any = undefined;
let attempts = 0;

export function getGradientComponents() {
    if (gradientComponents) return gradientComponents;
    if (attempts++ > 8) return null;
    try {
        const svg: any = findByProps("LinearGradient", "Stop", "Rect");
        const maskedModule: any = findByProps("MaskedView") ?? findByName("MaskedView", false);
        const Masked = maskedModule?.MaskedView ?? maskedModule?.default ??
            (typeof maskedModule === "function" ? maskedModule : null);
        const Svg = svg?.Svg ?? svg?.default;
        // If MaskedView is unavailable, SVG text still gives a continuous gradient.
        const SvgText = svg?.Text;
        if (Svg && svg?.Defs && svg?.LinearGradient && svg?.Stop && svg?.Rect && (Masked || SvgText)) {
            gradientComponents = {
                Masked, Svg, SvgText, Defs: svg.Defs, LinearGradient: svg.LinearGradient,
                Stop: svg.Stop, Rect: svg.Rect,
            };
        }
    } catch (e) {
        // Don't crash the plugin when Metro names change.
    }
    return gradientComponents ?? null;
}

export function hasSmoothGradient() {
    return !!getGradientComponents();
}

function GradientText({ text, textProps = {} }: { text: string; textProps?: any }) {
    const [size, setSize] = React.useState({ width: 0, height: 0 });
    const { start, end } = config();
    const components = getGradientComponents();

    const measure = (event: any) => {
        const next = event?.nativeEvent?.layout;
        if (!next || next.width <= 0 || next.height <= 0) return;
        if (Math.abs(size.width - next.width) > 0.5 || Math.abs(size.height - next.height) > 0.5) {
            setSize({ width: Math.ceil(next.width), height: Math.ceil(next.height) });
        }
    };

    if (!components) {
        return <RN.Text {...textProps} style={[textProps.style, { color: start }]}>{text}</RN.Text>;
    }

    const { Masked, Svg, SvgText, Defs, LinearGradient, Stop, Rect } = components;
    const maskProps: any = {
        numberOfLines: textProps.numberOfLines,
        allowFontScaling: textProps.allowFontScaling,
        maxFontSizeMultiplier: textProps.maxFontSizeMultiplier,
        style: [textProps.style, { color: "#000000" }],
    };
    const flatStyle = RN.StyleSheet?.flatten?.(textProps.style) ?? textProps.style ?? {};
    const fontSize = Number(flatStyle.fontSize) || 16;
    const svgGradient = (width: number, height: number) => <Svg width={width} height={height}>
        <Defs>
            <LinearGradient id="kettu-self-role-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <Stop offset="0%" stopColor={start} />
                <Stop offset="100%" stopColor={end} />
            </LinearGradient>
        </Defs>
        {Masked ? <Rect x={0} y={0} width={width} height={height}
            fill="url(#kettu-self-role-gradient)" /> :
            <SvgText x={0} y={height * 0.78} fontSize={fontSize}
                fontWeight={flatStyle.fontWeight ?? "normal"}
                fontFamily={flatStyle.fontFamily}
                fill="url(#kettu-self-role-gradient)">{text}</SvgText>}
    </Svg>;

    return <RN.View style={{ alignSelf: "flex-start", justifyContent: "center" }}>
        <RN.Text {...textProps} onLayout={measure}
            style={[textProps.style, { opacity: 0 }]}>{text}</RN.Text>
        {size.width > 0 && size.height > 0 &&
            (Masked ? <Masked pointerEvents="none"
                style={{ position: "absolute", top: 0, left: 0, width: size.width, height: size.height }}
                maskElement={<RN.Text {...maskProps}>{text}</RN.Text>}>
                {svgGradient(size.width, size.height)}
            </Masked> :
            <RN.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }}>
                {svgGradient(size.width, size.height)}
            </RN.View>)}
    </RN.View>;
}

export function RoleIcon() {
    const prefs = config();
    if (!prefs.enabled || !prefs.showIcon) return null;
    const id = emojiId(prefs.emojiId);
    if (id) {
        const tintColor = prefs.emojiTint ? prefs.iconColor : undefined;
        return <RN.Image source={{ uri: `https://cdn.discordapp.com/emojis/${id}.png?size=64` }}
            style={{ width: 18, height: 18, marginRight: 4, ...(tintColor ? { tintColor } : {}) }} />;
    }
    return prefs.icon ? <RN.Text style={{ color: prefs.iconColor, fontSize: 15, marginRight: 4 }}>
        {prefs.icon}
    </RN.Text> : null;
}

export function StyledName({ text, textProps = {}, nested = false }: {
    text: string; textProps?: any; nested?: boolean;
}) {
    const prefs = config();
    if (!prefs.enabled) return <RN.Text {...textProps}>{text}</RN.Text>;
    if (nested) {
        // Views cannot be children of RN Text; preserve its valid layout.
        return <RN.Text {...textProps} style={[textProps.style, { color: prefs.start }]}>{text}</RN.Text>;
    }
    return <RN.View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
        <RoleIcon />
        <GradientText text={text} textProps={textProps} />
    </RN.View>;
}
