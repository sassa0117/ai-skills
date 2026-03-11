import React, { useState, useRef, useCallback } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  StatusBar,
  Alert,
  Image,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { applyVividFilter } from "./lib/vivid-filter";

export default function App() {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [mlPermission, requestMlPermission] = MediaLibrary.usePermissions();
  const [vivid, setVivid] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  const squareSize = screenW;
  const topBarH = Math.max(Math.floor((screenH - squareSize) / 2), 80);
  const bottomBarH = screenH - squareSize - topBarH;

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95 });
      if (!photo) {
        setCapturing(false);
        return;
      }

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

      let finalUri = cropped.uri;
      if (vivid) {
        finalUri = await applyVividFilter(cropped.uri);
      }

      setPreview(finalUri);
    } catch (e) {
      console.error("Capture error:", e);
      Alert.alert("エラー", "撮影に失敗しました");
    }
    setCapturing(false);
  }, [capturing, vivid]);

  const handleSave = useCallback(async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      if (!mlPermission?.granted) {
        const res = await requestMlPermission();
        if (!res.granted) {
          Alert.alert("エラー", "ギャラリーへの保存権限が必要です");
          setSaving(false);
          return;
        }
      }
      await MediaLibrary.saveToLibraryAsync(preview);
      setSavedCount((c) => c + 1);
      setPreview(null);
    } catch (e) {
      console.error("Save error:", e);
      Alert.alert("エラー", "保存に失敗しました");
    }
    setSaving(false);
  }, [preview, saving, mlPermission]);

  const handleRetake = () => setPreview(null);

  // Permission screen
  if (!permission?.granted) {
    return (
      <View style={s.permScreen}>
        <StatusBar barStyle="light-content" />
        <Text style={s.permIcon}>📷</Text>
        <Text style={s.permTitle}>カメラの権限が必要です</Text>
        <Text style={s.permDesc}>スクエア撮影にカメラを使用します</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>許可する</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Preview screen
  if (preview) {
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
        <View style={[s.previewTopBar, { height: topBarH }]}>
          <Text style={s.previewTitle}>プレビュー</Text>
        </View>
        <Image
          source={{ uri: preview }}
          style={{ width: squareSize, height: squareSize }}
          resizeMode="cover"
        />
        <View style={[s.previewBottomBar, { height: bottomBarH }]}>
          <TouchableOpacity style={s.retakeBtn} onPress={handleRetake}>
            <Text style={s.retakeBtnText}>撮り直す</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={s.saveBtnText}>保存</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera screen
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Top overlay */}
      <View style={[s.overlay, { top: 0, height: topBarH }]}>
        <View style={s.topContent}>
          {savedCount > 0 && (
            <View style={s.countBadge}>
              <Text style={s.countText}>{savedCount}枚保存済み</Text>
            </View>
          )}
        </View>
      </View>

      {/* Square frame */}
      <View
        style={[s.squareWrap, { top: topBarH, width: squareSize, height: squareSize }]}
        pointerEvents="none"
      >
        <View style={s.frameBorder} />
        <View style={[s.gridH, { top: "33.33%" }]} />
        <View style={[s.gridH, { top: "66.66%" }]} />
        <View style={[s.gridV, { left: "33.33%" }]} />
        <View style={[s.gridV, { left: "66.66%" }]} />
      </View>

      {/* Bottom overlay */}
      <View style={[s.overlay, { bottom: 0, height: bottomBarH }]} />

      {/* Controls */}
      <View style={[s.controls, { bottom: 0, height: bottomBarH }]}>
        <TouchableOpacity
          onPress={() => setVivid((v) => !v)}
          style={[s.toggleBtn, vivid && s.toggleOn]}
        >
          <Text style={s.toggleIcon}>☀</Text>
          <Text style={[s.toggleLabel, vivid && s.toggleLabelOn]}>ビビッド</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleCapture}
          style={s.shutter}
          disabled={capturing}
          activeOpacity={0.7}
        >
          {capturing ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <View style={s.shutterInner} />
          )}
        </TouchableOpacity>

        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 2,
  },
  topContent: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 12,
  },
  countBadge: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  countText: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "600" },
  squareWrap: { position: "absolute", left: 0, zIndex: 3 },
  frameBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
  },
  gridH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  gridV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 24,
    zIndex: 10,
  },
  toggleBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  toggleOn: {
    backgroundColor: "rgba(255,215,0,0.25)",
    borderWidth: 2,
    borderColor: "#FFD700",
  },
  toggleIcon: { fontSize: 22 },
  toggleLabel: { color: "rgba(255,255,255,0.6)", fontSize: 9, fontWeight: "700" },
  toggleLabelOn: { color: "#FFD700" },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#fff" },
  previewTopBar: {
    backgroundColor: "#000",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 12,
  },
  previewTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  previewBottomBar: {
    backgroundColor: "#000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 32,
    flex: 1,
  },
  retakeBtn: { paddingVertical: 14, paddingHorizontal: 24 },
  retakeBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  saveBtnText: { color: "#000", fontSize: 16, fontWeight: "700" },
  permScreen: {
    flex: 1,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 32,
  },
  permIcon: { fontSize: 56 },
  permTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  permDesc: { color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center" },
  permBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  permBtnText: { color: "#000", fontSize: 16, fontWeight: "700" },
});
