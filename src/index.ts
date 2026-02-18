import { getInput, info, debug, setFailed, setOutput } from "@actions/core";
import { statSync, readFileSync } from "fs";
import process from "process";
import path from "path";

import type { Endpoint } from "./api-types";

const apiBase = process.env.NEXUSMODS_API_BASE?.trim() || "https://api.nexusmods.com/v3";

function createApiClient(apiKey: string) {
  return async function fetchWithAuth(
    url: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1],
  ): ReturnType<typeof fetch> {
    const headers = {
      "Content-Type": "application/json",
      apikey: apiKey,
      ...options?.headers,
    };

    const init = { headers, ...options };
    debug(`Fetching URL: ${url} with options: ${JSON.stringify(init, null, 2)}`);

    return fetch(`${apiBase}${url}`, init);
  };
}

type ApiClient = ReturnType<typeof createApiClient>;

type GetModFileDetailsEndpoint = Endpoint<"/games/{game_domain}/mod_files/{file_id}">;

async function getModFileDetails(
  params: GetModFileDetailsEndpoint["params"],
  api: ApiClient,
): Promise<GetModFileDetailsEndpoint["response"]> {
  const { file_id, game_domain } = params;
  const url = `/games/${game_domain}/mod_files/${file_id}`;
  const response = await api(url);

  if (!response.ok) {
    throw new Error(`Failed to get Mod file details: ${response.status} - ${await response.text()}`);
  }

  return (await response.json()) as GetModFileDetailsEndpoint["response"];
}

type RequestUploadEndpoint = Endpoint<"/uploads", "post", 201>;

async function requestUpload(
  params: RequestUploadEndpoint["body"],
  api: ApiClient,
): Promise<RequestUploadEndpoint["response"]> {
  const { filename, size_bytes } = params;
  const url = `/uploads`;

  info(`Requesting upload URL from: ${url}`);
  const response = await api(url, {
    method: "POST",
    body: JSON.stringify({
      filename: path.basename(filename),
      size_bytes: String(size_bytes),
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.status} - ${await response.text()}`);
  }

  return (await response.json()) as RequestUploadEndpoint["response"];
}

async function uploadFile(uploadUrl: string, filePath: string, fileSize: number): Promise<void> {
  const fileBuffer = readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileSize),
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  }
}

type FinaliseUploadEndpoint = Endpoint<"/uploads/{id}/finalise", "post">;

async function finaliseUpload(
  params: FinaliseUploadEndpoint["params"],
  api: ApiClient,
): Promise<FinaliseUploadEndpoint["response"]> {
  const { id } = params;
  const url = `/uploads/${id}/finalise`;
  info(`Finalising upload at: ${url}`);

  const response = await api(url, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to finalise upload: ${response.status} - ${await response.text()}`);
  }

  return (await response.json()) as FinaliseUploadEndpoint["response"];
}

type GetUploadEndpoint = Endpoint<"/uploads/{id}">;

async function pollUploadState(
  params: GetUploadEndpoint["params"],
  api: ApiClient,
  pollIntervalMs = 2000,
  maxAttempts = 60,
): Promise<GetUploadEndpoint["response"]> {
  const { id } = params;
  const url = `/uploads/${id}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await api(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`Failed to get upload state: ${response.status} - ${await response.text()}`);
    }

    const data = (await response.json()) as GetUploadEndpoint["response"];
    info(`Polling upload ${id}: state = ${data.state}`);

    if (data.state === "available") {
      return data;
    }

    if (data.state === "failed") {
      throw new Error(`Upload processing failed for ${id}`);
    }

    const delay = Math.min(pollIntervalMs * Math.pow(1.5, attempt), 30000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw new Error(`Upload processing timed out after ${maxAttempts} attempts for ${id}`);
}

type ClaimFileEndpoint = Endpoint<"/mod_files", "post", 201>;

async function createModFile(
  params: ClaimFileEndpoint["body"],
  api: ApiClient,
): Promise<ClaimFileEndpoint["response"]> {
  const url = `/mod_files`;
  info(`Claiming file at: ${url}`);

  const response = await api(url, {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Failed to create Mod file: ${response.status} - ${await response.text()}`);
  }

  return (await response.json()) as ClaimFileEndpoint["response"];
}

type UpdateModFileEndpoint = Endpoint<"/mod_files/update_groups/{group_id}/versions", "post", 201>;

async function updateModFile(
  params: UpdateModFileEndpoint["params"],
  body: UpdateModFileEndpoint["body"],
  api: ApiClient,
): Promise<UpdateModFileEndpoint["response"]> {
  const { group_id } = params;
  const url = `/mod_files/update_groups/${group_id}/versions`;
  info(`Updating mod file at: ${url}`);

  const response = await api(url, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to update Mod file: ${response.status} - ${await response.text()}`);
  }

  return (await response.json()) as UpdateModFileEndpoint["response"];
}

export async function run(): Promise<void> {
  info("Starting NexusMods upload action");

  try {
    const apiKey = getInput("api_key", { required: true });
    const api = createApiClient(apiKey);

    const fileID = parseInt(getInput("file_id", { required: true }), 10);
    const gameDomain = getInput("game_domain_name", { required: true });
    const filename = getInput("filename", { required: true });
    const version = getInput("version", { required: true });
    const name = getInput("name") || path.basename(filename);
    const fileCategory = (getInput("file_category") || "main") as ClaimFileEndpoint["body"]["file_category"];

    const { size: fileSize } = statSync(filename);

    // Step 1: Get file group id from mod file details
    const { update_group_version: { group_id = 0 } = {} } = await getModFileDetails(
      { game_domain: gameDomain, file_id: fileID },
      api,
    );
    if (group_id == 0) {
      throw new Error(`Mod file does not have a group_id`);
    }
    info(`Received update group version: ${group_id}`);

    // Step 2: Request upload location
    const { presigned_url, uuid } = await requestUpload({ size_bytes: fileSize, filename }, api);
    info(`Received upload UUID: ${uuid}`);

    // Step 3: Upload file data
    await uploadFile(presigned_url, filename, fileSize);
    info("File data uploaded successfully");

    // Step 4: Finalise upload
    const finaliseResult = await finaliseUpload({ id: uuid }, api);
    info(`Finalised upload: ${finaliseResult.uuid} (state: ${finaliseResult.state})`);

    // Step 5: Poll until upload is available
    await pollUploadState({ id: uuid }, api);
    info("Upload is now available");

    // Step 6: Update file (associate with mod)
    const { uid: file_uid } = await updateModFile(
      { group_id: `${group_id}` },
      {
        upload_id: uuid,
        name,
        version,
        file_category: fileCategory,
      },
      api,
    );
    setOutput("file_uid", file_uid);
    info("File updated successfully");

    info("File uploaded successfully to NexusMods.");
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message);
    } else {
      setFailed(String(error));
    }
  }
}

run();
