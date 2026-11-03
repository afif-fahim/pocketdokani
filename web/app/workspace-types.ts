export type Context = "seller" | "judge";
export type Section = "orders" | "assistant" | "stock" | "conversations";

export type Source = {
  id: string;
  sequence: number;
  filename: string;
  sha256: string;
  url: string;
  size: number;
  width: number;
  height: number;
};

export type Workspace = {
  id: string;
  reference: string;
  layout: string;
  context: Context;
  created_at: string;
  seller_side: "left" | "right";
  confirmed_by: string;
  confirmed_at: string;
  sources: Source[];
};
