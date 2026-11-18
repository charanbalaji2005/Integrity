import React, { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, ScanFace, Video } from "lucide-react";
import { toast } from "sonner";
import { type CameraResolution, openPreferredCamera, usePreferences } from "../preferences";
import { Button, Card, Row, SavedLocallyNote, SectionHeader, Segmented, Select, StatusPill, ToggleRow } from "../ui";

type FaceResult = { tone: "ok" | "warn" | "bad"; text: string } | null;

export function CameraSection({ userId, userRole }: { userId: string; userRole: string }) {
  const { prefs, update } = usePreferences(userId);
  const cam = prefs.camera;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualSize, setActualSize] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [faceResult, setFaceResult] = useState<FaceResult>(null);

  const loadDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "videoinput"));
    } catch {
      setDevices([]);
    }
  }, []);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewing(false);
    setActualSize(null);
  }, []);

  const startPreview = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser doesn't support camera access.");
      return;
    }
    setStarting(true);
    setError(null);
    setFaceResult(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await openPreferredCamera(userId);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings();
      if (settings?.width && settings?.height) setActualSize(`${settings.width}×${settings.height}`);
      setPreviewing(true);
      // Labels are only available after permission is granted.
      loadDevices();
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser's site settings."
          : name === "NotFoundError"
            ? "No camera was found on this device."
            : "Couldn't start the camera. It may be in use by another app.",
      );
      setPreviewing(false);
    } finally {
      setStarting(false);
    }
  }, [userId, loadDevices]);

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadDevices);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [loadDevices]);

  // Restart the preview when the chosen camera or quality changes.
  useEffect(() => {
    if (previewing) startPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam.deviceId, cam.resolution]);

  const testFace = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      toast.error("Start the camera preview first.");
      return;
    }
    const scale = Math.min(1, 480 / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const selfie = canvas.toDataURL("image/jpeg", 0.8);

    setChecking(true);
    setFaceResult(null);
    try {
      const res = await fetch("/api/proctoring/face-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": userId, "x-user-role": userRole },
        body: JSON.stringify({ selfie }),
      });
      const body = await res.json().catch(() => null);
      const d = body?.data;
      if (!res.ok || !body?.success) {
        setFaceResult({ tone: "bad", text: body?.message || "The face check service returned an error." });
      } else if (!d.faceDetected) {
        setFaceResult({ tone: "bad", text: "No face detected. Face the camera in good lighting." });
      } else if (d.multipleFaces) {
        setFaceResult({ tone: "warn", text: "More than one face detected. Only you should be in frame." });
      } else {
        const conf = Math.round((d.confidenceScore ?? 0) * 100);
        setFaceResult({
          tone: d.match ? "ok" : "warn",
          text: d.match ? `Face detected · ${conf}% confidence. You're ready for exams.` : d.message,
        });
      }
    } catch {
      setFaceResult({ tone: "bad", text: "Couldn't reach the face check service." });
    } finally {
      setChecking(false);
    }
  };

  const deviceOptions = [
    { value: "", label: "System default" },
    ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `Camera ${i + 1}` })),
  ];
  const selectedMissing = !!cam.deviceId && devices.length > 0 && !devices.some((d) => d.deviceId === cam.deviceId);

  return (
    <div>
      <SectionHeader
        title="Camera & Face ID"
        description="Choose the webcam used for identity checks and proctored exams, and test that face detection works."
      />

      <Card title="Camera preview">
        <div className="relative aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-[#dedede] bg-[#1a1917]">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${cam.mirror ? "-scale-x-100" : ""} ${previewing ? "" : "hidden"}`}
          />
          {!previewing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-[12.5px] text-[#cfcfcf]">
              <CameraOff className="size-6" aria-hidden="true" />
              {error ?? "Camera is off"}
            </div>
          )}
          {previewing && actualSize && (
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">{actualSize}</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {previewing ? (
            <Button variant="secondary" onClick={stopPreview}>
              <CameraOff className="size-3.5" /> Stop camera
            </Button>
          ) : (
            <Button onClick={startPreview} disabled={starting}>
              {starting ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />} Start camera
            </Button>
          )}
          <Button variant="secondary" onClick={testFace} disabled={!previewing || checking}>
            {checking ? <Loader2 className="size-3.5 animate-spin" /> : <ScanFace className="size-3.5" />} Test face verification
          </Button>
        </div>
        {faceResult && (
          <div className="mt-3" aria-live="polite">
            <StatusPill tone={faceResult.tone}>{faceResult.text}</StatusPill>
          </div>
        )}
      </Card>

      <Card title="Camera options" description="Used by onboarding verification and the exam proctoring camera.">
        <Row label="Webcam" description={selectedMissing ? "Your saved camera isn't connected; the default will be used." : "Start the preview to see camera names."} htmlFor="cam-device">
          <Select
            id="cam-device"
            value={selectedMissing ? "" : cam.deviceId ?? ""}
            onChange={(v) => update("camera", { deviceId: v || null })}
            options={deviceOptions}
          />
        </Row>
        <Row label="Image quality" description="Lower quality works better on slow connections.">
          <Segmented<CameraResolution>
            label="Image quality"
            value={cam.resolution}
            onChange={(resolution) => update("camera", { resolution })}
            options={[
              { value: "low", label: "Low · 360p" },
              { value: "standard", label: "Standard · 720p" },
              { value: "high", label: "High · 1080p" },
            ]}
          />
        </Row>
        <ToggleRow
          label="Mirror preview"
          description="Flips this preview like a mirror. Captured photos are never mirrored."
          checked={cam.mirror}
          onChange={(mirror) => update("camera", { mirror })}
        />
        <SavedLocallyNote />
      </Card>
    </div>
  );
}
