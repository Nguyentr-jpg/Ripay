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
        thumbnailUrl: file.thumbnailLink ? file.thumbnailLink.replace('=s220', '=s400') : null,
        downloadUrl: file.webContentLink,
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

async function fetchFromDropbox(sharedLink, accessToken) {
  try {
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
            url: sharedLink
          }
        })
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.json();
      throw new Error(error.error_summary || 'Failed to fetch from Dropbox');
    }

    const listData = await listResponse.json();

    // Filter image/video files
    const mediaFiles = listData.entries.filter(entry => {
      if (entry['.tag'] !== 'file') return false;
      const ext = entry.name.toLowerCase();
      return ext.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi)$/);
    });

    // Get thumbnail for each file
    const filesWithThumbnails = await Promise.all(
      mediaFiles.map(async (file) => {
        try {
          // Get thumbnail
          const thumbResponse = await fetch(
            'https://content.dropboxapi.com/2/files/get_thumbnail_v2',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Dropbox-API-Arg': JSON.stringify({
                  resource: {
                    '.tag': 'link',
                    url: sharedLink,
                    path: file.path_display
                  },
                  format: 'jpeg',
                  size: 'w480h320'
                })
              }
            }
          );

          let thumbnailUrl = null;
          if (thumbResponse.ok) {
            const blob = await thumbResponse.blob();
            thumbnailUrl = URL.createObjectURL(blob);
          }

          return {
            id: file.id,
            name: file.name,
            type: file.name.match(/\.(mp4|mov|avi)$/) ? 'video' : 'image',
            thumbnailUrl,
            downloadUrl: null, // Will be available after payment
            provider: 'dropbox'
          };
        } catch (err) {
          console.error('Dropbox thumbnail error:', err);
          return null;
        }
      })
    );

    const files = filesWithThumbnails.filter(f => f !== null);

    return {
      success: true,
      provider: 'dropbox',
      files,
      count: files.length
    };
  } catch (error) {
    console.error('Dropbox API Error:', error);
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
      const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
      if (!accessToken) {
        return res.status(500).json({
          success: false,
          error: 'Dropbox access token not configured'
        });
      }

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
