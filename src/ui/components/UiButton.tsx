import { Pressable, Text, View, PressableProps } from "react-native";

type Props = PressableProps & { label: string; disabled?: boolean };

export default function UiButton({ label, disabled, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        backgroundColor: "#182032",
        borderColor: "#263149",
        borderWidth: 1,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 14,
      })}
    >
      <View>
        <Text
          style={{
            color: "#e6eef9",
            textAlign: "center",
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
