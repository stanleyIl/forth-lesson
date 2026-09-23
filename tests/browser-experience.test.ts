import { describe, expect, it } from "vitest";
import { materialDetailPage, materialsPage } from "../src/web/pages.js";

describe("material browser experience", () => {
  it("contains role-aware course interaction controls", () => {
    const page = materialsPage();
    for (const marker of ["/api/me", "upload-card", "material-filter", "list-view", "grid-view", "campusclaw_theme", "campusclaw_view", "showModal", "upload.onprogress", "/api/logout"]) {
      expect(page).toContain(marker);
    }
    expect(page).not.toContain("localStorage.setItem('role'");
    expect(page).not.toContain("localStorage.setItem('class");
  });

  it("sanitizes unsafe Markdown while retaining GFM structure", () => {
    const html = materialDetailPage(
      { id: "m", uploader_user_id: "u", class_id: "a", original_filename: "lesson.md", storage_key: "safe.md", file_type: "md", size_bytes: 1, created_at: new Date() },
      [{ id: "e", material_id: "m", class_id: "a", sequence_number: 0, created_at: new Date(), content: "# Heading\n\n- item\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))" }],
    );
    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<li>item</li>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
  });
});
