// src/ui/HomeScreen.tsx
import React, {useEffect} from "react";
import { View, Text, TouchableOpacity, Dimensions, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useWalletStore } from "../state/useWalletStore";
import { useProfileStore } from "../state/useProfileStore";
import NamePromptModal from "../ui/NamePromptModal."; // 👈 IMPORTANTE
import { useFocusEffect } from "@react-navigation/native";
import { initAudio, playMusic, setMusicFromStore } from "../audio/audio";
import { useAudioStore } from "../state/useAudioStore";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

const { width: W } = Dimensions.get("window");

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();

  // Datos reales
  const coins = useWalletStore((s) => s.coins);
  const elo = useProfileStore((s) => s.playerElo);

  // (Opcional) botón de debug para re-mostrar el prompt
  const setHasOnboarded = useProfileStore((s) => s.setHasOnboarded);
  const setPlayerName = useProfileStore((s) => s.setPlayerName);

  // 👇 Bono de arranque: +1500 una sola vez por lanzamiento de la app
  const addCoins = useWalletStore((s) => s.addCoins);
  const _grantedOnBoot = React.useRef(false);
  React.useEffect(() => {
    if (!_grantedOnBoot.current) {
      addCoins(1500);
      _grantedOnBoot.current = true;
    }
  }, [addCoins]);

  // si quieres reflejar cambios de volumen/mute en tiempo real:
  useEffect(() => {
    (async () => {
      await initAudio();
      await playMusic("theme", { loop: true, respectExisting: true }); // 👈 clave
      await setMusicFromStore(); // refleja volumen/mute persistidos
    })();
  }, []);

  useEffect(() => {
    const unsub = useAudioStore.subscribe(() => {
      setMusicFromStore();
    });
    return unsub;
  }, []);
 
  const TileBtn = ({
    label,
    sub,
    to,
    bg = "#6C5CE7",
    border = "#3D2C8D",
    emoji,
  }: {
    label: string;
    sub?: string;
    to: keyof RootStackParamList;
    bg?: string;
    border?: string;
    emoji: string;
  }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navigation.navigate(to)}
      style={{
        width: (W - 40 - 12) / 2, // 2 columnas
        height: 88,
        borderRadius: 18,
        backgroundColor: bg,
        borderWidth: 3,
        borderColor: border,
        marginBottom: 12,
        padding: 10,
        justifyContent: "center",
        shadowColor: border,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "900",
          color: "white",
          marginBottom: 2,
          textShadowColor: "rgba(0,0,0,0.3)",
          textShadowOffset: { width: 1, height: 2 },
          textShadowRadius: 3,
        }}
      >
        {emoji} {label}
      </Text>
      {!!sub && (
        <Text style={{ color: "rgba(255,255,255,0.9)", fontWeight: "700" }}>{sub}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#0b1022" }}>
      {/* 👇 MONTA EL MODAL DE ONBOARDING */}
      <NamePromptModal />

      {/* decor cartoon (fijo detrás) */}
      <View
        style={{
          position: "absolute",
          width: W * 0.9,
          height: W * 0.9,
          borderRadius: W * 0.45,
          backgroundColor: "#1f2a6b",
          top: -W * 0.3,
          right: -W * 0.2,
          opacity: 0.9,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: W * 0.6,
          height: W * 0.6,
          borderRadius: W * 0.3,
          backgroundColor: "#142458",
          top: -W * 0.15,
          left: -W * 0.2,
          opacity: 0.85,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: W * 1.2,
          height: 140,
          left: -W * 0.1,
          top: 0,
          borderBottomLeftRadius: 40,
          borderBottomRightRadius: 40,
          backgroundColor: "#2133A0",
          opacity: 0.9,
        }}
      />

      {/* CONTENIDO SCROLLABLE */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 28,
          paddingBottom: 120, // espacio para que no tape el botón fijo
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={{ alignItems: "center", marginBottom: 10 }}>
          <Text
            style={{
              position: "absolute",
              top: 2,
              color: "#03123a",
              fontSize: 40,
              fontWeight: "900",
              letterSpacing: 1,
            }}
          >
            DEMON MATCH
          </Text>
          <Text
            style={{
              position: "absolute",
              top: 0,
              color: "#ffde59",
              fontSize: 40,
              fontWeight: "900",
              letterSpacing: 1,
            }}
          >
            DEMON MATCH
          </Text>
          <Text
            style={{
              color: "#ffffff",
              fontSize: 40,
              fontWeight: "900",
              letterSpacing: 1,
              textShadowColor: "rgba(0,0,0,0.4)",
              textShadowOffset: { width: 0, height: 3 },
              textShadowRadius: 6,
            }}
          >
            DEMON MATCH
          </Text>
        </View>

        {/* placa ELO/Coins */}
        <View
          style={{
            alignSelf: "center",
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 14,
            backgroundColor: "#00C2FF",
            borderWidth: 3,
            borderColor: "#0092CC",
            shadowColor: "#0092CC",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 6,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: "#032a3d", fontWeight: "900", fontSize: 14 }}>
            ⭐ ELO: {elo}   ·   💰 Coins: {coins}
          </Text>
        </View>

        {/* GRID (2 columnas) */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <TileBtn label="Historia" sub="Modo campaña" to="Story" emoji="📖" bg="#FF6B6B" border="#C83E4D" />
          <TileBtn label="Duelo" sub="Rápido 1v1" to="Normal" emoji="⚔️" bg="#3EC1D3" border="#0E9CB0" />
          <TileBtn label="Sin Fin" sub="Oleadas" to="Endless" emoji="♾️" bg="#845EC2" border="#5B36A8" />
          <TileBtn label="Colección" sub="Tus bibix" to="Collection" emoji="🧩" bg="#FFC75F" border="#E1A537" />
          <TileBtn label="Tienda" sub="Compra/Mejora" to="Store" emoji="🛒" bg="#F9F871" border="#D9D050" />
           <TileBtn label="Recompensas" sub="gratis" to="Ads" emoji="🎁" bg="#F472B6" border="#DB2777" />     
              
          <TileBtn label="Perfil" sub="Personaje" to="Profile" emoji="👽" bg="#4D7CFE" border="#274FD1" />
          {/* 👇 NUEVO: botón que redirige a Ads */}

          
          <TileBtn label="Eventos" sub="Pronto" to="Home" emoji="🎯" bg="#00D2A6" border="#00A07D" />
        </View>

        {/* (Opcional) botón de debug para re-abrir el prompt */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setPlayerName(""); setHasOnboarded(false); }}
          style={{
            marginTop: 12,
            alignSelf: "center",
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: "#ffffff22",
            borderWidth: 1,
            borderColor: "#ffffff44",
          }}
        >
          <Text style={{ color: "#fff" }}>Debug: volver a pedir nombre</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* BOTÓN FIJO (no scrollea) */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          backgroundColor: "transparent",
        }}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate("Normal")}
          style={{
            height: 56,
            borderRadius: 16,
            backgroundColor: "#FF4D6D",
            borderWidth: 3,
            borderColor: "#C62E50",
            justifyContent: "center",
            alignItems: "center",
            shadowColor: "#C62E50",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Text
            style={{
              color: "white",
              fontWeight: "900",
              fontSize: 18,
              textShadowColor: "rgba(0,0,0,0.35)",
              textShadowOffset: { width: 1, height: 2 },
              textShadowRadius: 3,
            }}
          >
            ▶️ JUGAR AHORA
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
