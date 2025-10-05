import React from "react";
import { Pressable, Text, ViewStyle } from "react-native";

type Props = {
  label: string;
  selected?: boolean;   // 👈 nuevo (lo que usas en CollectionScreen)
  active?: boolean;     // 👈 compatibilidad hacia atrás
  onPress?: () => void;
  style?: ViewStyle;
};

const TOON = {
  card: "#E4E9F0",
  border: "#C1CCDA",
  ink: "#141B25",
  sub: "#485568",
  focus: "#3E8EDC",
};

export default function Chip({ label, selected, active, onPress, style }: Props) {
  const isOn = (selected ?? active) === true;

  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: TOON.card,
          borderWidth: 2,
          borderColor: isOn ? TOON.focus : TOON.border,
          marginRight: 8,
          marginBottom: 8,
        },
        style,
      ]}
      android_ripple={{ color: "#00000018", borderless: false }}
    >
      <Text
        style={{
          color: isOn ? TOON.ink : TOON.sub,
          fontWeight: "700",
          textTransform: "capitalize",
          fontSize: 12,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
