"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Image from "next/image";
import {
  ArrowUpRight,
  Check,
  ImagePlus,
  Layers2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MODELS,
  RATIOS,
  type AspectRatio,
  type ModelId,
  type Resolution,
  type StudioAvailability,
} from "@/lib/studio/contracts";
import type { StudioAsset, StudioJob } from "@/lib/studio/durable/types";
import { StudioRealtime } from "./studio-realtime";
import { StudioChallenge } from "./studio-challenge";
import { StudioViewer } from "./studio-viewer";

type PendingRequest = {
  requestId: string;
  regenerateAssetId?: string;
  prompt?: string;
  model?: ModelId;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
  referenceAssetId?: string | null;
};
const pendingKey = (userId: string) => `8x-studio-pending:${userId}`;
const starters = [
  {
    label: "Product still life",
    prompt:
      "A sculptural coral perfume bottle on dark volcanic stone, soft side lighting, subtle mist, editorial product photography.",
  },
  {
    label: "Editorial portrait",
    prompt:
      "An editorial portrait in a minimalist graphite studio, warm late-afternoon light, natural texture, confident composition.",
  },
  {
    label: "An imagined place",
    prompt:
      "A quiet modernist house among desert dunes, sculptural architecture, warm dawn light, cinematic wide composition.",
  },
];
export function ImageStudio({
  availability,
}: {
  availability: StudioAvailability;
}) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>(
    availability.enabledModels[0] ?? MODELS[0].id,
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [resolution, setResolution] = useState<Resolution>("1K");
  const [reference, setReference] = useState<{
    id: string;
    name: string;
    imageUrl: string;
    source: string;
  }>();
  const [job, setJob] = useState<StudioJob>();
  const [history, setHistory] = useState<StudioAsset[]>([]);
  const [selected, setSelected] = useState<StudioAsset>();
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState("");
  const [uploading, setUploading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<{ id: string; anonymous: boolean } | null>(
    null,
  );
  const [connecting, setConnecting] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [state, setState] = useState(availability);
  const [pending, setPending] = useState<PendingRequest>();
  const userIdRef = useRef<string | undefined>(undefined);
  const [challenge, setChallenge] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const submitting = useRef(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const viewerRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy =
    dispatching || (!!job && !["completed", "failed"].includes(job.status));
  const currentModel = MODELS.find((m) => m.id === model)!;
  const refreshHistory = useCallback(async () => {
    const response = await fetch("/api/image-studio/history", {
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        data.error?.message ?? "Your saved images could not be loaded.",
      );
    const assets = data.assets as StudioAsset[],
      jobs = data.jobs as StudioJob[];
    const ownerId = userIdRef.current;
    const stored = ownerId ? sessionStorage.getItem(pendingKey(ownerId)) : null;
    const prior = stored ? (JSON.parse(stored) as PendingRequest) : undefined;
    const recovered =
      prior && jobs.some((j) => j.requestId === prior.requestId);
    if (recovered && ownerId) sessionStorage.removeItem(pendingKey(ownerId));
    setPending(recovered ? undefined : prior);
    setHistory(assets);
    setState(data.availability);
    setSelected(
      (current) => assets.find((a) => a.id === current?.id) ?? assets[0],
    );
    setJob(
      jobs.find((j) => !["completed", "failed"].includes(j.status)) ?? jobs[0],
    );
    setConnectionLost(false);
  }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/image-studio/session", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error?.message ?? "Your workspace could not be connected.",
          );
        if (!active) return;
        setUser(data.user);
        userIdRef.current = data.user?.id;
        setState(data.availability);
        if (data.user) await refreshHistory();
      } catch (e) {
        if (active) {
          if (userIdRef.current) setConnectionLost(true);
          setValidation(
            e instanceof Error
              ? e.message
              : "Your workspace could not be connected.",
          );
        }
      } finally {
        if (active) setBooting(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [refreshHistory]);
  const activeJobId = job?.id;
  const refreshJob = useCallback(async () => {
    if (!activeJobId) return;
    try {
      const response = await fetch(`/api/image-studio/jobs/${activeJobId}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error();
      const next = data.job as StudioJob;
      setJob(next);
      setConnectionLost(false);
      if (next.status === "completed" && next.asset) {
        setSelected(next.asset);
        setNotice("Your image is saved and ready.");
        await refreshHistory();
        requestAnimationFrame(() => viewerRef.current?.focus());
      }
    } catch {
      setConnectionLost(true);
    }
  }, [activeJobId, refreshHistory]);
  useEffect(() => {
    if (!job || ["completed", "failed"].includes(job.status)) return;
    const timer = setInterval(() => void refreshJob(), 3000);
    return () => clearInterval(timer);
  }, [job, refreshJob]);
  async function startWorkspace() {
    if (connecting) return;
    setConnecting(true);
    setValidation("");
    try {
      const response = await fetch("/api/image-studio/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: challenge }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ?? "Guest sign-in could not be completed.",
        );
      setUser(data.user);
      userIdRef.current = data.user.id;
      await refreshHistory();
      setNotice("Your private guest workspace is ready.");
    } catch (e) {
      if (userIdRef.current) setConnectionLost(true);
      setValidation(
        e instanceof Error
          ? e.message
          : "Guest sign-in could not be completed.",
      );
    } finally {
      setConnecting(false);
      setChallenge("");
      setChallengeKey((k) => k + 1);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!user) {
      setValidation("Start your guest workspace before adding a reference.");
      return;
    }
    setValidation("");
    setNotice("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setValidation("Choose one PNG, JPEG, or WebP image up to 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const response = await fetch("/api/image-studio/references", {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          "x-request-id": crypto.randomUUID(),
          "x-file-name": encodeURIComponent(file.name.slice(0, 160)),
        },
        body: file,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error?.message ?? "The reference could not be saved.",
        );
      setReference(data.reference);
      setNotice("Reference saved. Describe what you want to create or change.");
    } catch (e) {
      setValidation(
        e instanceof Error ? e.message : "The reference could not be saved.",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function generate(override?: StudioAsset, retryOriginal = false) {
    if (submitting.current || busy || (pending && !retryOriginal)) return;
    const text = override?.prompt ?? prompt.trim();
    if (!retryOriginal && (!text || text.length > 4000)) {
      setValidation("Describe your image in 1–4,000 characters.");
      promptRef.current?.focus();
      return;
    }
    if (
      !user ||
      !state.available ||
      uploading ||
      (connectionLost && !retryOriginal)
    )
      return;
    const input: PendingRequest =
      retryOriginal && pending
        ? pending
        : override
          ? { requestId: crypto.randomUUID(), regenerateAssetId: override.id }
          : {
              requestId: crypto.randomUUID(),
              prompt: text,
              model,
              aspectRatio,
              resolution,
              referenceAssetId: reference?.id ?? null,
            };
    try {
      sessionStorage.setItem(pendingKey(user.id), JSON.stringify(input));
    } catch {
      setValidation(
        "Allow session storage so an interrupted request can be recovered safely.",
      );
      return;
    }
    setPending(input);
    submitting.current = true;
    setDispatching(true);
    setJob(undefined);
    setValidation("");
    setNotice("");
    try {
      const response = await fetch("/api/image-studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, challengeToken: challenge }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await response.json().catch(() => {
        throw new TypeError("Unconfirmed response");
      });
      if (response.status >= 500 || (response.ok && !data.job))
        throw new TypeError("Unconfirmed response");
      if (!response.ok) {
        if (!retryOriginal) {
          sessionStorage.removeItem(pendingKey(user.id));
          setPending(undefined);
        }
        throw new Error(
          data.error?.message ?? "The generation could not be started.",
        );
      }
      sessionStorage.removeItem(pendingKey(user.id));
      setPending(undefined);
      setJob(data.job);
      setNotice("Your generation is queued. You can return to it later.");
      if (window.matchMedia("(max-width: 767px)").matches)
        requestAnimationFrame(() =>
          viewerRef.current?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
          }),
        );
    } catch (e) {
      const uncertain = e instanceof TypeError || e instanceof DOMException;
      setValidation(
        uncertain
          ? "The submission could not be confirmed. Check saved jobs or retry this same request safely; a new request is blocked."
          : e instanceof Error
            ? e.message
            : "The generation could not be started.",
      );
      if (uncertain) setConnectionLost(true);
    } finally {
      submitting.current = false;
      setDispatching(false);
      setChallenge("");
      setChallengeKey((k) => k + 1);
    }
  }
  function useReference(asset: StudioAsset) {
    setReference({
      id: asset.id,
      name: "Generated image",
      imageUrl: asset.imageUrl,
      source: "ai-generated",
    });
    setNotice(
      "Generated image added as your reference. Describe the next change.",
    );
    promptRef.current?.focus();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void generate();
  }
  return (
    <div className="studio-page">
      <form className="studio-controls" onSubmit={submit}>
        <div className="studio-controls-body">
          <div className="studio-intro">
            <span className="eyebrow">
              <Sparkles aria-hidden="true" /> Make something yours
            </span>
            <h1>Image Studio</h1>
            <p>From a first thought to a fresh perspective.</p>
          </div>
          <fieldset disabled={busy || booting} className="studio-fields">
            <div className="studio-field">
              <label htmlFor="studio-prompt">
                Your idea <span>Required</span>
              </label>
              <textarea
                ref={promptRef}
                id="studio-prompt"
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setValidation("");
                }}
                maxLength={4000}
                placeholder="Describe the subject, setting, light, and feeling you have in mind…"
                aria-describedby="prompt-hint"
                aria-invalid={validation.startsWith("Describe") || undefined}
              />
              <div className="field-caption">
                <span id="prompt-hint">
                  A little detail makes a difference.
                </span>
                <span>{prompt.length.toLocaleString()} / 4,000</span>
              </div>
            </div>
            <div className="studio-field">
              <label htmlFor="studio-reference">
                Reference image <span>Optional</span>
              </label>
              <input
                ref={fileRef}
                id="studio-reference"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => void upload(e.target.files?.[0])}
                disabled={busy || uploading}
              />
              {reference ? (
                <div className="studio-reference">
                  <Image
                    unoptimized
                    src={reference.imageUrl}
                    width={64}
                    height={64}
                    alt="Selected reference"
                  />
                  <div>
                    <strong>{reference.name}</strong>
                    <span>
                      {reference.source === "ai-generated"
                        ? "AI-generated reference"
                        : "Uploaded reference"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    aria-label="Remove reference"
                    onClick={() => {
                      setReference(undefined);
                      setNotice("Reference removed.");
                    }}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="upload-reference"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload aria-hidden="true" />
                  {uploading ? "Saving image…" : "Add a reference"}
                  <ArrowUpRight aria-hidden="true" />
                </Button>
              )}
              <p className="field-help">
                PNG, JPEG, WebP · up to 5 MB. Sent to Google only when you
                generate.
              </p>
            </div>
            <fieldset className="studio-field model-field">
              <legend>Image model</legend>
              <div className="model-options">
                {MODELS.map((m) => (
                  <label
                    key={m.id}
                    className="model-option"
                    data-selected={model === m.id}
                    data-disabled={!availability.enabledModels.includes(m.id)}
                  >
                    <input
                      type="radio"
                      name="model"
                      value={m.id}
                      checked={model === m.id}
                      disabled={!availability.enabledModels.includes(m.id)}
                      onChange={() => {
                        setModel(m.id);
                        if (
                          !(m.resolutions as readonly string[]).includes(
                            resolution,
                          )
                        )
                          setResolution("1K");
                      }}
                    />
                    <span className="model-icon">
                      <Sparkles aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{m.name}</strong>
                      <small>
                        {availability.enabledModels.includes(m.id)
                          ? m.description
                          : "Unavailable · not verified"}
                      </small>
                    </span>
                    <Check className="model-check" aria-hidden="true" />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="studio-setting-row">
              <div className="studio-field">
                <label htmlFor="aspect-ratio">Aspect ratio</label>
                <select
                  id="aspect-ratio"
                  value={aspectRatio}
                  onChange={(e) =>
                    setAspectRatio(e.target.value as AspectRatio)
                  }
                >
                  {RATIOS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="studio-field">
                <label htmlFor="resolution">Resolution</label>
                <select
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value as Resolution)}
                >
                  {currentModel.resolutions.map((r) => (
                    <option key={r} value={r}>
                      {r === "512" ? "512 px" : r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="future-model"
                  tabIndex={0}
                  aria-label="More image models, Coming soon"
                >
                  <Layers2 aria-hidden="true" />
                  <span>More image models</span>
                  <button type="button" disabled tabIndex={-1}>
                    Soon
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>
          </fieldset>
        </div>
        <div className="studio-generate-bar">
          {!state.available && (
            <p className="studio-error" role="status">
              {state.reason}
            </p>
          )}
          {validation && (
            <p className="studio-error" role="alert">
              {validation}
            </p>
          )}
          {job?.status === "failed" && (
            <p className="studio-error" role="alert">
              {job.error?.message}
            </p>
          )}
          <StudioChallenge key={challengeKey} onToken={setChallenge} />
          {!user && (
            <Button
              type="button"
              className="generate-button"
              disabled={booting || connecting}
              onClick={() => void startWorkspace()}
            >
              {booting
                ? "Connecting workspace…"
                : connecting
                  ? "Starting workspace…"
                  : "Start guest workspace"}
            </Button>
          )}
          {(connectionLost || (pending && !dispatching)) && (
            <Button
              variant="outline"
              type="button"
              onClick={() =>
                void refreshHistory().catch(() =>
                  setValidation(
                    "Saved jobs are still unavailable. Please reconnect and try again.",
                  ),
                )
              }
            >
              Check saved jobs
            </Button>
          )}
          {pending && !dispatching && (
            <Button
              variant="outline"
              type="button"
              disabled={busy || !state.available}
              onClick={() => void generate(undefined, true)}
            >
              Retry original request
            </Button>
          )}
          {user && (
            <Button
              className="generate-button"
              type="submit"
              disabled={
                busy ||
                booting ||
                uploading ||
                !user ||
                !state.available ||
                connectionLost ||
                !!pending
              }
            >
              <Sparkles aria-hidden="true" />
              {busy ? "Creating your image…" : "Generate image"}
              <span aria-hidden="true">↗</span>
            </Button>
          )}
          <p>One image at a time. Higher resolutions use more credits.</p>
        </div>
      </form>
      <section
        className="studio-workspace"
        aria-label="Creative workspace"
        aria-busy={busy}
      >
        <header className="studio-workspace-header">
          <div>
            <span className="eyebrow">Your creative space</span>
            <h2 ref={viewerRef} tabIndex={-1}>
              {selected ? "A new perspective." : "Room for your next idea."}
            </h2>
          </div>
          <span className="session-badge">
            <span /> Private workspace
          </span>
        </header>
        <StudioViewer
          asset={selected}
          busy={busy || booting}
          stage={booting ? "loading" : dispatching ? "submitting" : job?.status}
          connectionLost={connectionLost}
          onRegenerate={(asset) => void generate(asset)}
          onReference={useReference}
        />
        {!selected && !busy && !booting && (
          <div className="studio-starters">
            <p>A starting point, if you need one</p>
            <div>
              {starters.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setPrompt(s.prompt);
                    promptRef.current?.focus();
                  }}
                >
                  <ImagePlus aria-hidden="true" />
                  {s.label}
                  <ArrowUpRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        )}
        {history.length > 0 && (
          <section className="studio-history" aria-label="Saved image history">
            <div className="history-heading">
              <h3>
                Recent explorations <span>{history.length}</span>
              </h3>
              <p>Latest 24 images · saved privately</p>
            </div>
            <div className="history-images">
              {history.map((asset, i) => (
                <button
                  type="button"
                  key={asset.id}
                  disabled={busy}
                  aria-label={`View generated image ${history.length - i}`}
                  aria-pressed={selected?.id === asset.id}
                  onClick={() => {
                    setSelected(asset);
                    setNotice("Selected a saved image.");
                  }}
                >
                  <Image
                    unoptimized
                    src={asset.imageUrl}
                    width={80}
                    height={80}
                    alt=""
                  />
                  <span>{history.length - i}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {job && !["completed", "failed"].includes(job.status) && (
          <StudioRealtime job={job} onUpdate={refreshJob} />
        )}
        {connectionLost && (
          <p className="studio-error" role="status">
            Connection interrupted. Your job is retained; reconnect to check its
            status.
          </p>
        )}
        <p className="studio-session-note">
          Images and active jobs survive reloads. Your guest workspace belongs
          to this browser; clearing cookies or changing devices loses access.
          Download images you want to keep independently.
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {busy
            ? "Your generation is in progress and saved to this workspace."
            : notice}
        </p>
      </section>
    </div>
  );
}
