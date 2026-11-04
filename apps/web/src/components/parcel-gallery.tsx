import type { ReactNode } from "react";
import Image, { type StaticImageData } from "next/image";
import { ImagePreviewButton } from "@/components/image-viewer";
import { Stamp } from "@/components/khata";
import parcelCleanDome from "../../public/product/parcel-clean-dome.jpg";
import parcelSwappedError from "../../public/product/parcel-swapped-error.jpg";
import parcelPrepaidBag from "../../public/product/parcel-prepaid-bag.jpg";
import parcelBlackDome from "../../public/product/parcel-black-dome.jpg";
import parcelWrongBag from "../../public/product/parcel-wrong-bag.jpg";

export function ProductImage({
  src,
  alt,
  label,
  sizes,
  className,
  preload,
}: {
  src: StaticImageData;
  alt: string;
  label: string;
  sizes: string;
  className?: string;
  preload?: boolean;
}) {
  return (
    <ImagePreviewButton
      src={src.src}
      alt={alt}
      aria-label={label}
      className={
        className
          ? `product-image-trigger ${className}`
          : "product-image-trigger"
      }
    >
      <Image src={src} alt={alt} sizes={sizes} preload={preload} />
    </ImagePreviewButton>
  );
}

type Scenario = {
  badgeTone: "pass" | "danger" | "warning" | "neutral";
  badge: string;
  src: StaticImageData;
  alt: string;
  label: string;
  order: string;
  meta: { text: string; danger?: boolean }[];
  heading: string;
  body: ReactNode;
};

const SCENARIOS: Scenario[] = [
  {
    badgeTone: "pass",
    badge: "01 · Clean label & matching SKU",
    src: parcelCleanDome,
    alt: "Packed parcel PD-SAMPLE-01 with a clean handwritten label (Demo recipient, phone marker 01X-EXAMPLE, Example Road, Dhaka, 980/-) beside the plain brown dome bag.",
    label: "Open full-size photo of clean parcel PD-SAMPLE-01",
    order: "PD-SAMPLE-01",
    meta: [{ text: "COD: BDT 980/-" }, { text: "SKU: Brown Dome Bag" }],
    heading: "Every field in its row, bag beside the parcel.",
    body: (
      <>
        Label order number, recipient name, phone marker, address, and{" "}
        <code>980/-</code> COD are written in their designated rows with the
        unsealed handbag visible beside the box for SKU comparison.
      </>
    ),
  },
  {
    badgeTone: "danger",
    badge: "02 · Swapped rows & wrong COD (890/- vs 980/-)",
    src: parcelSwappedError,
    alt: "Illustrated parcel PD-SAMPLE-01 where the phone marker is written in the Name row, the name in the Number row, and the price is 890/- instead of 980/-.",
    label: "Open full-size photo of swapped-row parcel PD-SAMPLE-01",
    order: "PD-SAMPLE-01",
    meta: [
      { text: "Written: 890/- (Expected 980/-)", danger: true },
      { text: "Row swap error" },
    ],
    heading: "An illustrated failure type: swapped rows and a wrong COD.",
    body: (
      <>
        Here the phone marker sits in <code>NAME:</code>, the name in{" "}
        <code>NUMBER:</code>, and the COD reads <code>890/-</code>. The blind
        read plus deterministic field comparison is designed to catch swapped or
        mismatched values. On November 4, wrong-COD fixtures returned{" "}
        <strong>unsure</strong> in the smoke run and <strong>fail</strong> on
        the redrawn label below. This photo itself was not run.
      </>
    ),
  },
  {
    badgeTone: "warning",
    badge: "03 · Scratched-out phone & prepaid 0/- COD",
    src: parcelPrepaidBag,
    alt: "Illustrated parcel PD-SAMPLE-03 with a scratched-out then rewritten phone marker and 0/- price next to a brown leather chain shoulder bag.",
    label: "Open full-size photo of prepaid parcel PD-SAMPLE-03",
    order: "PD-SAMPLE-03",
    meta: [
      { text: "Written COD: 0/-" },
      { text: "SKU: Brown Chain Shoulder Bag" },
    ],
    heading: "Handwritten corrections and advance payments.",
    body: (
      <>
        A crossed-out number on the label makes optical reading
        ambiguous—returning <code>unsure</code> prompts a clearer photo or
        explicit seller review. And a <code>0/-</code> COD is accepted only when
        the seller has confirmed a verified prior payment.
      </>
    ),
  },
  {
    badgeTone: "neutral",
    badge: "04 · Colour variant check",
    src: parcelBlackDome,
    alt: "Illustrated parcel PD-SAMPLE-04 with price 970/- beside the plain black dome bag variant.",
    label: "Open full-size photo of black dome bag parcel PD-SAMPLE-04",
    order: "PD-SAMPLE-04",
    meta: [{ text: "COD: BDT 970/-" }, { text: "SKU: Black Dome Bag" }],
    heading: "Distinguishing Black vs. Brown SKU variants before sealing.",
    body: (
      <>
        The same dome bag ships in multiple colourways. Placing the unsealed bag
        beside the parcel lets Spark compare the visible product against the
        confirmed SKU photo before the bag goes into the flyer.
      </>
    ),
  },
  {
    badgeTone: "danger",
    badge: "05 · Bag style mismatch",
    src: parcelWrongBag,
    alt: "White parcel labeled PD-SAMPLE-05 with COD 1,080 beside a blue canvas tote.",
    label: "Open full-size photo of the blue tote beside parcel PD-SAMPLE-05",
    order: "PD-SAMPLE-05",
    meta: [
      { text: "COD: BDT 1,080" },
      { text: "Expected SKU: Black Shoulder Bag" },
    ],
    heading: "Catch a bag mix-up before sealing.",
    body: (
      <>
        The label shows the expected label order number and COD. The visible
        blue canvas tote differs from the compact black shoulder bag on the
        confirmed order.
      </>
    ),
  },
];

export function ParcelGallery() {
  return (
    <div className="packing-table">
      {SCENARIOS.map((scenario) => (
        <figure
          className="pinned-photo"
          data-tone={scenario.badgeTone}
          key={scenario.order + scenario.badge}
        >
          <div className="pinned-image">
            <ProductImage
              src={scenario.src}
              alt={scenario.alt}
              label={scenario.label}
              sizes="(max-width: 760px) 90vw, 32vw"
            />
            <span className="pinned-stamp">
              <Stamp tone="neutral">Illustration</Stamp>
            </span>
          </div>
          <figcaption>
            <p className="pinned-badge">{scenario.badge}</p>
            <p className="pinned-meta">
              <code>Order {scenario.order}</code>
              {scenario.meta.map(({ text, danger }) => (
                <span className={danger ? "danger-text" : undefined} key={text}>
                  {text}
                </span>
              ))}
            </p>
            <h3>{scenario.heading}</h3>
            <p>{scenario.body}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
