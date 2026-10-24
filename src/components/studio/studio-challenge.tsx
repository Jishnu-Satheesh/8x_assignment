"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}
export function StudioChallenge({
  onToken,
}: {
  onToken: (token: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const render = useCallback(() => {
    if (sitekey && element.current && window.turnstile && !widget.current)
      widget.current = window.turnstile.render(element.current, {
        sitekey,
        theme: "dark",
        callback: onToken,
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
  }, [sitekey, onToken]);
  useEffect(() => {
    render();
    return () => {
      if (widget.current) {
        window.turnstile?.remove(widget.current);
        widget.current = undefined;
      }
    };
  }, [render]);
  if (!sitekey) return null;
  return (
    <div className="studio-challenge">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={render}
      />
      <div ref={element} />
      <p className="field-help">
        Complete the security check before continuing.
      </p>
    </div>
  );
}
