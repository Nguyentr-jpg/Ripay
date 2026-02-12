/**
 * API endpoint to fetch media thumbnails from Google Drive or Dropbox
 * Auto-detects link type and returns thumbnail URLs
 */

// =============================================================================
// Link Detection & Parsing
// =============================================================================

function detectLinkType(url) {
  if (!url) return null;

  if (url.includes('drive.google.com')) return 'google-drive';
  if (url.includes('dropbox.com')) return 'dropbox';

  return null;
}

function extractGoogleDriveFolderId(url) {
  // https://drive.google.com/drive/folders/FOLDER_ID
  const folderMatch = url.match(/\/folders\/([^/?]+)/);
  if (folderMatch) return folderMatch[1];

  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  const uFolderMatch = url.match(/\/u\/\d+\/folders\/([^/?]+)/);
  if (uFolderMatch) return uFolderMatch[1];

  return null;
}

function extractDropboxSharedLink(url) {
  // Return the full shared link
  return url;
}

// =============================================================================
// Google Drive API
// =============================================================================

async function fetchFromGoogleDrive(folderId, apiKey) {
  try {
    // List files in folder
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?` +
      `q='${folderId}'+in+parents` +
      `&key=${apiKey}` +
      `&fields=files(id,name,mimeType,thumbnailLink,webContentLink)` +
      `&pageSize=100` +
      `&orderBy=name`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch from Google Drive');
    }

    const data = await response.json();

    // Filter only image/video files and format response
    const files = (data.files || [])
      .filter(file =>
        file.mimeType?.startsWith('image/') ||
        file.mimeType?.startsWith('video/')
      )
      .map(file => ({
        id: file.id,
        name: file.name,
        type: file.mimeType,
        thumbnailUrl: file.thumbnailLink ? file.thumbnailLink.replace('=s220', '=s2048') : null,
        previewUrl: `https://drive.google.com/uc?export=view&id=${file.id}`,
        downloadUrl: `https://drive.google.com/uc?export=download&id=${file.id}`,
        provider: 'google-drive'
      }));

    return {
      success: true,
      provider: 'google-drive',
      files,
      count: files.length
    };
  } catch (error) {
    console.error('Google Drive API Error:', error);
    return {
      success: false,
      provider: 'google-drive',
      error: error.message,
      files: []
    };
  }
}

// =============================================================================
// Dropbox API
// =============================================================================

/**
 * Get a fresh Dropbox access token using the refresh token.
 * Short-lived tokens expire in 4 hours, so we refresh every time.
 */
async function getDropboxAccessToken() {
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;

  if (!refreshToken || !appKey || !appSecret) {
    throw new Error('Dropbox credentials not configured (need DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET)');
  }

  console.log('[Dropbox] Refreshing access token...');

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Dropbox] Token refresh failed:', response.status, errorText);
    throw new Error('Failed to refresh Dropbox token: ' + errorText);
  }

  const data = await response.json();
  console.log('[Dropbox] Token refreshed, expires in', data.expires_in, 'seconds');
  return data.access_token;
}

async function fetchFromDropbox(sharedLink, accessToken) {
  try {
    console.log('[Dropbox] Fetching shared link:', sharedLink);
    console.log('[Dropbox] Token prefix:', accessToken.substring(0, 10) + '...');

    // Clean the shared link - remove dl=0/dl=1 params and normalize
    const cleanUrl = sharedLink.split('?')[0];
    const urlParams = new URL(sharedLink).searchParams;
    const rlkey = urlParams.get('rlkey');
    const finalUrl = rlkey ? `${cleanUrl}?rlkey=${rlkey}&dl=0` : `${cleanUrl}?dl=0`;

    console.log('[Dropbox] Clean URL:', finalUrl);

    // List folder contents
    const listResponse = await fetch(
      'https://api.dropboxapi.com/2/files/list_folder',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: '',
          shared_link: {
            url: finalUrl
          }
        })
      }
    );

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error('[Dropbox] list_folder error:', listResponse.status, errorText);
      let errorMessage;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_summary || errorText;
      } catch {
        errorMessage = errorText;
      }
      throw new Error(errorMessage);
    }

    const listData = await listResponse.json();
    console.log('[Dropbox] Found entries:', listData.entries?.length);

    // Filter image/video files
    const mediaFiles = listData.entries.filter(entry => {
      if (entry['.tag'] !== 'file') return false;
      const ext = entry.name.toLowerCase();
      return ext.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi)$/);
    });

    // Get lightweight thumbnails for grid, and use on-demand preview URLs for lightbox
    const filesWithThumbnails = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < mediaFiles.length; i += BATCH_SIZE) {
      const batch = mediaFiles.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const filePath = file.path_lower || file.path_display || file.id;

            const thumbResponse = await fetch(
              'https://content.dropboxapi.com/2/files/get_thumbnail_v2',
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Dropbox-API-Arg': JSON.stringify({
                    resource: {
                      '.tag': 'path',
                      path: filePath
                    },
                    format: 'jpeg',
                    // Higher-res thumbnail for sharper gallery cards
                    // Dropbox thumbnail API uses preset sizes (no exact 360px long side).
                    // w480h320 is the closest practical option above 360.
                    size: 'w480h320'
                  })
                }
              }
            );

            let thumbnailUrl = null;
            if (thumbResponse.ok) {
              const arrayBuffer = await thumbResponse.arrayBuffer();
              const base64 = Buffer.from(arrayBuffer).toString('base64');
              thumbnailUrl = `data:image/jpeg;base64,${base64}`;
            } else {
              console.error('Dropbox thumbnail failed for', file.name, ':', thumbResponse.status, await thumbResponse.text());
            }

            const previewUrl =
              `/api/dropbox-file?mode=preview&size=w1280h960` +
              `&link=${encodeURIComponent(finalUrl)}` +
              `&path=${encodeURIComponent(filePath)}`;

            return {
              id: file.id,
              name: file.name,
              type: file.name.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image',
              thumbnailUrl,
              previewUrl,
              downloadUrl: previewUrl,
              provider: 'dropbox'
            };
          } catch (err) {
            console.error('Dropbox thumbnail error for', file.name, ':', err.message);
            return {
              id: file.id,
              name: file.name,
              type: file.name.match(/\.(mp4|mov|avi)$/i) ? 'video' : 'image',
              thumbnailUrl: null,
              downloadUrl: null,
              provider: 'dropbox'
            };
          }
        })
      );
      filesWithThumbnails.push(...batchResults);
    }

    const files = filesWithThumbnails.filter(f => f !== null);
    const withThumbs = files.filter(f => f.thumbnailUrl).length;
    console.log(`[Dropbox] Done: ${files.length} files, ${withThumbs} with thumbnails`);

    return {
      success: true,
      provider: 'dropbox',
      files,
      count: files.length
    };
  } catch (error) {
    console.error('[Dropbox] API Error:', error.message);
    return {
      success: false,
      provider: 'dropbox',
      error: error.message,
      files: []
    };
  }
}

// =============================================================================
// Main Handler
// =============================================================================

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: url'
      });
    }

    // Detect link type
    const linkType = detectLinkType(url);

    if (!linkType) {
      return res.status(400).json({
        success: false,
        error: 'Invalid link. Please provide a Google Drive or Dropbox shared link.'
      });
    }

    // Fetch media based on link type
    let result;

    if (linkType === 'google-drive') {
      const folderId = extractGoogleDriveFolderId(url);
      if (!folderId) {
        return res.status(400).json({
          success: false,
          error: 'Could not extract folder ID from Google Drive link'
        });
      }

      const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'Google Drive API key not configured'
        });
      }

      result = await fetchFromGoogleDrive(folderId, apiKey);
    }
    else if (linkType === 'dropbox') {
      const accessToken = await getDropboxAccessToken();
      result = await fetchFromDropbox(url, accessToken);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Fetch Media API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
