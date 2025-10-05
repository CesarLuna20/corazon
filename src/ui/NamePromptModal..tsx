// src/ui/NamePromptModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useProfileStore } from "../state/useProfileStore";

const TOON = {
  bg: "#0b0d12",
  card: "#121826",
  ink: "#E6F0FF",
  inkDim: "#99A7C2",
  primary: "#6BA6FF",
  danger: "#FF6B7A",
  line: "#263247",
};

export default function NamePromptModal() {
  const { playerName, hasOnboarded, setPlayerName, setHasOnboarded } = useProfileStore();
  const needsPrompt = useMemo(() => !hasOnboarded || !playerName, [playerName, hasOnboarded]);

  const [visible, setVisible] = useState(needsPrompt);
  const [name, setName] = useState(playerName ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisible(needsPrompt);
  }, [needsPrompt]);

  const validate = (raw: string) => {
    const v = raw.trim();
    if (v.length < 2) return "Mínimo 2 caracteres.";
    if (v.length > 16) return "Máximo 16 caracteres.";
    // Letras/números/espacios/guiones/guion_bajo. (Permite acentos)
    const re = /^[\p{L}\p{N} _-]+$/u;
    if (!re.test(v)) return "Usa letras, números y espacios.";
    return null;
  };

  const onConfirm = () => {
    const err = validate(name);
    if (err) {
      setError(err);
      return;
    }
    const clean = name.trim();
    setPlayerName(clean);
    setHasOnboarded(true);
    setVisible(false);
  };

  // Si ya no hace falta, no renders
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            backgroundColor: TOON.card,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: TOON.line,
          }}
        >
          <Text style={{ color: TOON.ink, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
            ¡Bienvenido!
          </Text>
          <Text style={{ color: TOON.inkDim, fontSize: 14, marginBottom: 12 }}>
            Ingresa tu nombre de jugador. Podrás cambiarlo luego en Perfil.
          </Text>

          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              if (error) setError(null);
            }}
            placeholder="Tu nombre"
            placeholderTextColor={TOON.inkDim}
            style={{
              backgroundColor: TOON.bg,
              color: TOON.ink,
              borderWidth: 1,
              borderColor: error ? TOON.danger : TOON.line,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              marginBottom: 8,
            }}
            autoCapitalize="words"
            autoFocus
            maxLength={24}
            returnKeyType="done"
            onSubmitEditing={onConfirm}
          />

          {!!error && (
            <Text style={{ color: TOON.danger, fontSize: 12, marginBottom: 8 }}>{error}</Text>
          )}

          <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                backgroundColor: TOON.primary,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
              })}
            >
              <Text style={{ color: "#0b0d12", fontWeight: "700" }}>Confirmar</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
