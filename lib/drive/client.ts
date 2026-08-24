import { google } from 'googleapis';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface ListFilesResult {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * Creates a Google Drive client with the provided access token
 */
export function createDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return google.drive({ version: 'v3', auth });
}

/**
 * Lists files from Google Drive that match transcription criteria
 * Supports .txt, .docx, .pdf files
 */
export async function listDriveFiles(
  accessToken: string,
  options: {
    pageSize?: number;
    pageToken?: string;
    folderId?: string;
  } = {}
): Promise<ListFilesResult> {
  const drive = createDriveClient(accessToken);
  const { pageSize = 20, pageToken, folderId } = options;

  // Build query for transcription files
  const mimeTypes = [
    'text/plain',
    'application/vnd.google-apps.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
  ];

  let query = mimeTypes.map((type) => `mimeType='${type}'`).join(' or ');
  query = `(${query}) and trashed=false`;

  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    pageSize,
    pageToken,
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)',
    orderBy: 'modifiedTime desc',
  });

  return {
    files: (response.data.files || []) as DriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/**
 * Gets the content of a file from Google Drive
 */
export async function getDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string> {
  const drive = createDriveClient(accessToken);

  // Google Docs need to be exported
  if (mimeType === 'application/vnd.google-apps.document') {
    const response = await drive.files.export({
      fileId,
      mimeType: 'text/plain',
    });
    return response.data as string;
  }

  // Other files can be downloaded directly
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  );

  return response.data as string;
}

/**
 * Lists folders from Google Drive
 */
export async function listDriveFolders(
  accessToken: string,
  options: {
    pageSize?: number;
    pageToken?: string;
    parentId?: string;
  } = {}
): Promise<ListFilesResult> {
  const drive = createDriveClient(accessToken);
  const { pageSize = 50, pageToken, parentId } = options;

  let query = "mimeType='application/vnd.google-apps.folder' and trashed=false";

  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += " and 'root' in parents";
  }

  const response = await drive.files.list({
    q: query,
    pageSize,
    pageToken,
    fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
    orderBy: 'name',
  });

  return {
    files: (response.data.files || []) as DriveFile[],
    nextPageToken: response.data.nextPageToken || undefined,
  };
}
