import "server-only";
import { requireUser } from "../../supabase/server.ts";
import { createAdminClient } from "../../supabase/admin.ts";
import { StudioError } from "../contracts.ts";
import { createStudioStore } from "./store.ts";
import { BUCKET } from "./types.ts";
import { uuid } from "./http.ts";

export async function ownedAsset(id: string) {
  const { user, client } = await requireUser();
  const asset = await createStudioStore(client).findAsset(uuid(id), user.id);
  if (!asset?.ready)
    throw new StudioError(
      "NOT_FOUND",
      "This image is not available in your workspace.",
      404,
    );
  return { asset, storage: createAdminClient().storage.from(BUCKET) };
}
