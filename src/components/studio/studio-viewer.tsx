"use client";
import { useState } from "react";
import Image from "next/image";
import { Download, Focus, ImagePlus, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudioAsset, JobStatus } from "@/lib/studio/durable/types";
import { MODELS } from "@/lib/studio/contracts";

const phases = {
  submitting: {
    title: "Sending your idea",
    detail: "Confirming your request before it joins the queue.",
    label: "Submitting",
  },
  loading: {
    title: "Opening your workspace",
    detail: "Finding your saved images and active jobs.",
    label: "Connecting",
  },
  queued: {
    title: "An idea worth waiting for",
    detail:
      "Your request is queued. You can leave and return to this workspace.",
    label: "Queued",
  },
  preparing: {
    title: "Setting the scene",
    detail: "Checking your settings and preparing your reference.",
    label: "Preparing",
  },
  generating: {
    title: "Bringing your idea into focus",
    detail:
      "Google Gemini is creating your image. There is no need to keep this page open.",
    label: "Generating",
  },
  saving: {
    title: "Making it yours to keep",
    detail:
      "Saving your image and its original settings to your private workspace.",
    label: "Saving",
  },
};
export function StudioViewer({
  asset,
  busy,
  stage,
  connectionLost,
  onRegenerate,
  onReference,
}: {
  asset?: StudioAsset;
  busy: boolean;
  stage?: JobStatus | "loading" | "submitting";
  connectionLost: boolean;
  onRegenerate: (asset: StudioAsset) => void;
  onReference: (asset: StudioAsset) => void;
}) {
  const phase =
    phases[
      stage && stage in phases ? (stage as keyof typeof phases) : "queued"
    ];
  const [imageError, setImageError] = useState("");
  const [downloading, setDownloading] = useState(false);
  async function download() {
    if (!asset || downloading) return;
    setDownloading(true);
    setImageError("");
    try {
      const response = await fetch(asset.downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `8x-${asset.id}.${asset.mediaType === "image/jpeg" ? "jpg" : asset.mediaType === "image/webp" ? "webp" : "png"}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setImageError(
        "Your image could not be downloaded. Please reconnect and try again.",
      );
    } finally {
      setDownloading(false);
    }
  }
  return (
    <div className="studio-result">
      <div className="studio-canvas" data-has-image={!!asset}>
        {asset ? (
          <Image
            unoptimized
            priority
            src={asset.imageUrl}
            width={asset.width}
            height={asset.height}
            alt={`AI-generated: ${asset.prompt.slice(0, 200)}`}
            className="generated-image"
            onError={() =>
              setImageError(
                "Your saved image could not be loaded. Reload the workspace to try again.",
              )
            }
          />
        ) : (
          !busy && (
            <div className="studio-empty">
              <div className="empty-art" aria-hidden="true">
                <span />
                <span />
                <Focus />
              </div>
              <span className="eyebrow">
                A blank canvas. Endless possibilities.
              </span>
              <h3>What do you see?</h3>
              <p>
                Describe it on the left. Add a reference if you have one.
                <br />
                We’ll help you bring the idea into focus.
              </p>
            </div>
          )
        )}
        {busy && (
          <div className="studio-processing" role="status">
            <div className="processing-symbol">
              <Sparkles aria-hidden="true" />
            </div>
            <h3>{phase.title}</h3>
            <p>
              {connectionLost
                ? "Connection interrupted. Your saved job is retained while we reconnect."
                : phase.detail}
            </p>
            <span>{connectionLost ? "Reconnecting" : phase.label}</span>
            {stage !== "loading" && stage !== "submitting" && (
              <ol className="studio-stages" aria-label="Generation stages">
                {["queued", "preparing", "generating", "saving"].map((s) => (
                  <li key={s} aria-current={stage === s ? "step" : undefined}>
                    {s}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      {imageError && (
        <p className="studio-error" role="alert">
          {imageError}
        </p>
      )}
      {asset && (
        <>
          <div className="result-details">
            <div>
              <span className="generated-label">
                <Sparkles aria-hidden="true" /> AI-generated
              </span>
              <p>
                {MODELS.find((m) => m.id === asset.model)?.name}{" "}
                <span aria-hidden="true">·</span> {asset.width} × {asset.height}{" "}
                <span aria-hidden="true">·</span> {asset.aspectRatio}
              </p>
            </div>
            <span className="result-resolution">
              {asset.resolution === "512" ? "512 px" : asset.resolution}
            </span>
          </div>
          <div className="result-actions">
            <Button
              type="button"
              variant="outline"
              disabled={downloading}
              onClick={() => void download()}
            >
              <Download aria-hidden="true" />
              {downloading ? "Downloading…" : "Download"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onRegenerate(asset)}
            >
              <RotateCcw aria-hidden="true" />
              Regenerate
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onReference(asset)}
            >
              <ImagePlus aria-hidden="true" />
              Use as reference
            </Button>
          </div>
          <details className="result-prompt">
            <summary>View prompt &amp; settings</summary>
            <p>{asset.prompt}</p>
            <dl>
              <div>
                <dt>Provider model</dt>
                <dd>{asset.providerModel ?? asset.model}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>
                  {asset.aspectRatio} · {asset.resolution}
                </dd>
              </div>
              {asset.referenceAssetId && (
                <div>
                  <dt>Reference</dt>
                  <dd>Saved private reference</dd>
                </div>
              )}
              <div>
                <dt>Created</dt>
                <dd>{new Date(asset.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </details>
        </>
      )}
    </div>
  );
}
