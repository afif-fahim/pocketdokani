"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "@/components/app-shell";

type Preview = {
  src: string;
  alt: string;
  title?: string;
  filename?: string;
  checksum?: string;
  errorMessage?: string;
};

const ImageViewerContext = createContext<((preview: Preview) => void) | null>(
  null,
);

export function useImageViewer() {
  const open = useContext(ImageViewerContext);
  if (!open) throw new Error("Image viewer requires ImageViewerProvider");
  return open;
}

export function ImagePreviewButton({
  src,
  alt,
  className,
  children,
  "aria-label": label,
}: {
  src: string;
  alt: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const open = useImageViewer();

  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      aria-label={label}
      onClick={() => open({ src, alt })}
    >
      {children}
    </button>
  );
}

export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointerStartedOutside = useRef(false);
  const titleId = useId();

  useEffect(() => {
    if (preview && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [preview]);

  function open(preview: Preview) {
    setImageFailed(false);
    setPreview(preview);
  }

  return (
    <ImageViewerContext value={open}>
      {children}
      <dialog
        ref={dialogRef}
        className="image-viewer"
        aria-labelledby={titleId}
        onClose={() => setPreview(null)}
        onPointerDown={(event) => {
          pointerStartedOutside.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (
            pointerStartedOutside.current &&
            event.target === event.currentTarget
          ) {
            event.currentTarget.close();
          }
        }}
      >
        {preview && (
          <div className="image-viewer-panel">
            <div className="image-viewer-header">
              <div>
                <h2 id={titleId}>{preview.title ?? "Image preview"}</h2>
                {preview.filename && <p>{preview.filename}</p>}
              </div>
              <button
                type="button"
                className="image-viewer-close"
                aria-label="Close image viewer"
                onClick={() => dialogRef.current?.close()}
                autoFocus
              >
                <Icon name="close" />
              </button>
            </div>
            <div
              className="image-viewer-body"
              role="region"
              aria-label="Image and details"
              tabIndex={0}
            >
              {imageFailed ? (
                <p role="alert">
                  {preview.errorMessage ?? "This image could not be opened."}
                </p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- Preview the original, including authenticated and blob URLs.
                <img
                  src={preview.src}
                  alt={preview.alt}
                  onError={() => setImageFailed(true)}
                />
              )}
              {preview.checksum && (
                <details>
                  <summary>SHA-256 of the unchanged original</summary>
                  <code>{preview.checksum}</code>
                </details>
              )}
            </div>
          </div>
        )}
      </dialog>
    </ImageViewerContext>
  );
}
