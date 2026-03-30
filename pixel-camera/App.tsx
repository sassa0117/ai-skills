import React, { useState, useRef, useCallback } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  StatusBar,
  Alert,
  Animated,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";

const MODES = ["スクエア", "写真"] as const;
type Mode = (typeof MODES)[number];

export default function App() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [mlPermission, requestMlPermission] = MediaLibrary.usePermissions();
  const [mode, setMode] = useState<Mode>("写真");
  const [capturing, setCapturing] = useState(false);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const flashAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);

  const doFlash = () => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      if (!mlPermission?.granted) {
        const res = await requestMlPermission();
        if (!res.granted) {
          Alert.alert("エラー", "保存権限が必要です");
          setCapturing(false);
          return;
        }
      }

      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95 });
      if (!photo) {
        setCapturing(false);
        return;
      }

      let finalUri = photo.uri;

      if (mode === "スクエア") {
        const { width: pw, height: ph } = photo;
        const size = Math.min(pw, ph);
        const originX = Math.floor((pw - size) / 2);
        const originY = Math.floor((ph - size) / 2);
        const cropped = await ImageManipulator.manipulateAsync(
          photo.uri,
          [
            { crop: { originX, originY, width: size, height: size } },
            { resize: { width: 1080 } },
          ],
          { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
        );
        finalUri = cropped.uri;
      }

      await MediaLibrary.saveToLibraryAsync(finalUri);
      doFlash();
    } catch (e) {
      console.error("Capture error:", e);
      Alert.alert("エラー", "撮影に失敗しました");
    }
    setCapturing(false);
  }, [capturing, mode, mlPermission]);

  const toggleFacing = () => {
    setFacing((f) => (f === "back" ? "front" : "back"));
  };

  // Square mode dimensions
  const isSquare = mode === "スクエア";
  const barH = isSquare ? Math.floor((screenH - screenW) / 2) : 0;

  // Permission screen
  if (!permission?.granted) {
    return (
      <View style={s.permScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
        <Text style={s.permEmoji}>📷</Text>
        <Text style={s.permTitle}>カメラの権限が必要です</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>許可する</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Full screen camera preview */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* Square mode: black bars */}
      {isSquare && (
        <>
          <View style={[s.bar, { top: 0, height: barH }]} />
          <View style={[s.bar, { bottom: 0, height: barH }]} />
        </>
      )}

      {/* Flash effect */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: flashAnim }]}
        pointerEvents="none"
      />

      {/* Bottom controls */}
      <View style={[s.bottom, isSquare && { height: barH }]}>
        {/* Mode selector */}
        <View style={s.modeRow}>
          {MODES.map((m) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={s.modeItem}>
              <Text style={[s.modeText, mode === m && s.modeActive]}>{m}</Text>
              {mode === m && <View style={s.modeDot} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Shutter row */}
        <View style={s.shutterRow}>
          <View style={s.sidePlaceholder} />

          <TouchableOpacity
            onPress={handleCapture}
            style={s.shutter}
            disabled={capturing}
            activeOpacity={0.7}
          >
            <View style={[s.shutterInner, capturing && { backgroundColor: "#888" }]} />
          </TouchableOpacity>

          <TouchableOpacity onPress={toggleFacing} style={s.flipBtn}>
            <Text style={s.flipIcon}>⟲</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "#000",
    zIndex: 5,
  },

  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    justifyContent: "flex-end",
    paddingBottom: 30,
    zIndex: 10,
  },

  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginBottom: 24,
  },
  modeItem: {
    alignItems: "center",
  },
  modeText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  modeActive: {
    color: "#fff",
  },
  modeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#fff",
    marginTop: 5,
  },

  shutterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 50,
  },
  sidePlaceholder: {
    width: 44,
    height: 44,
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
  flipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  flipIcon: {
    color: "#fff",
    fontSize: 24,
  },

  permScreen: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  permEmoji: { fontSize: 56 },
  permTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  permBtn: {
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    marginTop: 12,
  },
  permBtnText: { color: "#000", fontSize: 15, fontWeight: "700" },
});
