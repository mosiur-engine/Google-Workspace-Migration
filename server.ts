import express from 'express';
import session from 'express-session';
import cors from 'cors';
import { google } from 'googleapis';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'super-secret-key-for-dev',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      httpOnly: true,
    },
  })
);

// Extend session type to include our tokens
declare module 'express-session' {
  interface SessionData {
    sourceTokens: any;
    destTokens: any;
  }
}

// OAuth2 Client setup
const getOAuth2Client = (redirectUri: string) => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/calendar',
];

// --- API Routes ---

app.get('/api/auth/url', (req, res) => {
  const type = req.query.type as string; // 'source' or 'dest'
  if (!type || (type !== 'source' && type !== 'dest')) {
    return res.status(400).json({ error: 'Invalid type parameter' });
  }

  const redirectUri = `${process.env.APP_URL}/auth/callback/${type}`;
  const oauth2Client = getOAuth2Client(redirectUri);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  res.json({ url });
});

app.get('/auth/callback/:type', async (req, res) => {
  const type = req.params.type;
  const code = req.query.code as string;

  if (!code || (type !== 'source' && type !== 'dest')) {
    return res.status(400).send('Invalid request');
  }

  try {
    const redirectUri = `${process.env.APP_URL}/auth/callback/${type}`;
    const oauth2Client = getOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    if (type === 'source') {
      req.session.sourceTokens = tokens;
    } else {
      req.session.destTokens = tokens;
    }

    // Send success message to parent window and close popup
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', accountType: '${type}' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/status', async (req, res) => {
  const getProfile = async (tokens: any) => {
    if (!tokens) return null;
    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      return data;
    } catch (e) {
      console.error('Error fetching profile:', e);
      return null;
    }
  };

  const sourceProfile = await getProfile(req.session.sourceTokens);
  const destProfile = await getProfile(req.session.destTokens);

  res.json({
    source: sourceProfile,
    dest: destProfile,
  });
});

app.post('/api/auth/logout', (req, res) => {
  const type = req.query.type as string;
  if (type === 'source') {
    req.session.sourceTokens = null;
  } else if (type === 'dest') {
    req.session.destTokens = null;
  } else {
    req.session.sourceTokens = null;
    req.session.destTokens = null;
  }
  res.json({ success: true });
});

// --- Transfer Logic ---

app.post('/api/transfer', async (req, res) => {
  const { sourceTokens, destTokens } = req.session;
  const { transferDrive, transferContacts, transferCalendar } = req.body;

  if (!sourceTokens || !destTokens) {
    return res.status(401).json({ error: 'Both source and destination accounts must be connected.' });
  }

  const sourceAuth = new google.auth.OAuth2();
  sourceAuth.setCredentials(sourceTokens);

  const destAuth = new google.auth.OAuth2();
  destAuth.setCredentials(destTokens);

  res.json({ message: 'Transfer started' });

  // In a real app, this should be a background job.
  // For this prototype, we'll do some basic synchronous/asynchronous transfers.
  try {
    if (transferContacts) {
      await transferContactsData(sourceAuth, destAuth);
    }
    if (transferCalendar) {
      await transferCalendarData(sourceAuth, destAuth);
    }
    if (transferDrive) {
      await transferDriveData(sourceAuth, destAuth);
    }
  } catch (error) {
    console.error('Transfer error:', error);
  }
});

async function transferContactsData(sourceAuth: any, destAuth: any) {
  const sourcePeople = google.people({ version: 'v1', auth: sourceAuth });
  const destPeople = google.people({ version: 'v1', auth: destAuth });

  try {
    const res = await sourcePeople.people.connections.list({
      resourceName: 'people/me',
      personFields: 'names,emailAddresses,phoneNumbers',
      pageSize: 100, // Limit for prototype
    });

    const connections = res.data.connections || [];
    console.log(`Found ${connections.length} contacts to transfer.`);

    for (const person of connections) {
      const newContact: any = {};
      if (person.names) newContact.names = person.names.map((n: any) => ({ givenName: n.givenName, familyName: n.familyName }));
      if (person.emailAddresses) newContact.emailAddresses = person.emailAddresses.map((e: any) => ({ value: e.value }));
      if (person.phoneNumbers) newContact.phoneNumbers = person.phoneNumbers.map((p: any) => ({ value: p.value }));

      if (Object.keys(newContact).length > 0) {
        await destPeople.people.createContact({
          requestBody: newContact,
        });
      }
    }
    console.log('Contacts transfer complete.');
  } catch (e) {
    console.error('Error transferring contacts:', e);
  }
}

async function transferCalendarData(sourceAuth: any, destAuth: any) {
  const sourceCalendar = google.calendar({ version: 'v3', auth: sourceAuth });
  const destCalendar = google.calendar({ version: 'v3', auth: destAuth });

  try {
    const res = await sourceCalendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50, // Limit for prototype
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = res.data.items || [];
    console.log(`Found ${events.length} calendar events to transfer.`);

    for (const event of events) {
      const newEvent = {
        summary: event.summary,
        location: event.location,
        description: event.description,
        start: event.start,
        end: event.end,
      };

      await destCalendar.events.insert({
        calendarId: 'primary',
        requestBody: newEvent,
      });
    }
    console.log('Calendar transfer complete.');
  } catch (e) {
    console.error('Error transferring calendar:', e);
  }
}

async function transferDriveData(sourceAuth: any, destAuth: any) {
  const sourceDrive = google.drive({ version: 'v3', auth: sourceAuth });
  const destDrive = google.drive({ version: 'v3', auth: destAuth });

  try {
    const res = await sourceDrive.files.list({
      pageSize: 10, // Limit for prototype
      fields: 'nextPageToken, files(id, name, mimeType)',
      q: "'me' in owners and trashed = false",
    });

    const files = res.data.files || [];
    console.log(`Found ${files.length} drive files to transfer.`);

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // Skip folders for this simple prototype
        continue;
      }

      // 1. Download from source
      try {
        const fileRes = await sourceDrive.files.get(
          { fileId: file.id!, alt: 'media' },
          { responseType: 'stream' }
        );

        // 2. Upload to dest
        await destDrive.files.create({
          requestBody: {
            name: file.name,
            mimeType: file.mimeType,
          },
          media: {
            mimeType: file.mimeType!,
            body: fileRes.data,
          },
        });
      } catch (dlError: any) {
        // Some Google Workspace files (like Docs/Sheets) cannot be downloaded directly via alt=media
        // They need to be exported. For prototype, we skip or log.
        console.log(`Skipping file ${file.name} (might be a Google Doc/Sheet which requires export)`);
      }
    }
    console.log('Drive transfer complete.');
  } catch (e) {
    console.error('Error transferring drive files:', e);
  }
}


// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
