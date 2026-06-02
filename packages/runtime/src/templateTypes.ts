export type TemplateKind = 'component' | 'scene' | 'effect' | 'pack';

export type TemplateReviewStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export type TemplateIpRisk = 'generic' | 'needs-review' | 'rejected';

export type TemplateAssetKind =
  | 'font'
  | 'image'
  | 'video'
  | 'lottie'
  | 'model3d'
  | 'audio'
  | 'sprite'
  | 'other';

export interface TemplateAsset {
  id: string;
  kind: TemplateAssetKind;
  title?: string;
  fileName?: string;
  contentType?: string;
  localPath?: string;
  publicUrl?: string;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  variableAxes?: string[];
  width?: number;
  height?: number;
  license?: string;
  source?: string;
  notes?: string;
}

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
  assets?: TemplateAsset[];
  thirdPartyAssets: TemplateAssetDisclosure[];
  path?: string;
  preview?: {
    thumbnail?: string;
    video?: string;
  };
}

export interface CommunityRegistry {
  schemaVersion: 1;
  templates: TemplateManifest[];
}
