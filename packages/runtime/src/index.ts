export type TemplateKind = "component" | "scene" | "effect" | "pack";

export type TemplateReviewStatus = "draft" | "pending" | "approved" | "rejected";

export type TemplateIpRisk = "generic" | "needs-review" | "rejected";

export interface TemplateAssetDisclosure {
  name: string;
  source: string;
  license: string;
  notes?: string;
}

export interface TemplateManifest {
  schemaVersion: 1;
  id: string;
  title: string;
  kind: TemplateKind;
  category: string;
  tags: string[];
  license: string;
  author: string;
  reviewStatus: TemplateReviewStatus;
  ipRisk: TemplateIpRisk;
  publishToShowcase: boolean;
  settings: string[];
  tokens: string[];
  thirdPartyAssets: TemplateAssetDisclosure[];
  preview?: {
    thumbnail?: string;
    video?: string;
  };
}

export interface CommunityRegistry {
  schemaVersion: 1;
  templates: TemplateManifest[];
}
