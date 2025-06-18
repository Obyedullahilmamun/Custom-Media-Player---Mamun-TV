const express = require('express');
const { google } = require('googleapis');
require('dotenv').config(); 

const app = express();

// Load from environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

app.get('/proxy', async (req, res) => {
  const fileId = req.query.id;
  if (!fileId) return res.status(400).send('No file id provided');

  try {
    const file = await drive.files.get({ fileId, fields: 'mimeType, name, size' });

    const mimeType = file.data.mimeType;
    const fileName = file.data.name;
    const fileSize = parseInt(file.data.size, 10);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    let range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);

      drive.files.get(
        {
          fileId,
          alt: 'media'
        },
        {
          responseType: 'stream',
          headers: { Range: `bytes=${start}-${end}` }
        },
        (err, response) => {
          if (err) return res.status(500).send('Error streaming file');
          response.data
            .on('end', () => {})
            .on('error', err => res.status(500).send('Stream error'))
            .pipe(res);
        }
      );
    } else {
      res.setHeader('Content-Length', fileSize);

      drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
        (err, response) => {
          if (err) return res.status(500).send('Error streaming file');
          response.data
            .on('end', () => {})
            .on('error', err => res.status(500).send('Stream error'))
            .pipe(res);
        }
      );
    }
  } catch (e) {
    res.status(500).send('Google Drive API error');
  }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
