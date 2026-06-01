import type { TemplateManifest } from "@mont-templates/runtime";

export function defineTemplateManifest(manifest: TemplateManifest): TemplateManifest {
  return manifest;
}

export function assertBrandSafeManifest(manifest: TemplateManifest): void {
  if (manifest.ipRisk === "rejected") {
    throw new Error(`Template "${manifest.id}" is marked as rejected for IP risk.`);
  }
  if (manifest.reviewStatus === "approved" && manifest.ipRisk !== "generic") {
    throw new Error(`Approved template "${manifest.id}" must have generic IP risk.`);
  }
}
