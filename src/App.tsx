import { useState, useEffect } from 'react';
import { ArrowRightLeft, CheckCircle2, AlertCircle, LogOut, RefreshCw, Database, Users, Calendar } from 'lucide-react';

interface UserProfile {
  name?: string;
  email?: string;
  picture?: string;
}

export default function App() {
  const [sourceUser, setSourceUser] = useState<UserProfile | null>(null);
  const [destUser, setDestUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

  const [options, setOptions] = useState({
    transferDrive: true,
    transferContacts: true,
    transferCalendar: true,
  });

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setSourceUser(data.source);
      setDestUser(data.dest);
    } catch (e) {
      console.error('Failed to fetch status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = async (type: 'source' | 'dest') => {
    try {
      const response = await fetch(`/api/auth/url?type=${type}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      const { url } = await response.json();

      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      alert('Failed to initiate connection. Check console for details.');
    }
  };

  const handleLogout = async (type: 'source' | 'dest') => {
    try {
      await fetch(`/api/auth/logout?type=${type}`, { method: 'POST' });
      fetchStatus();
    } catch (e) {
      console.error('Logout failed', e);
    }
  };

  const handleTransfer = async () => {
    if (!sourceUser || !destUser) return;
    setTransferring(true);
    setTransferStatus('Transfer initiated. Check server logs for progress (prototype).');
    try {
      const res = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      if (!res.ok) {
        const err = await res.json();
        setTransferStatus(`Error: ${err.error || 'Transfer failed'}`);
      } else {
        setTransferStatus('Transfer request sent successfully! Note: This prototype transfers a limited number of items.');
      }
    } catch (e) {
      console.error('Transfer failed', e);
      setTransferStatus('Transfer failed due to a network error.');
    } finally {
      setTransferring(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-blue-100 rounded-full mb-2">
            <ArrowRightLeft className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Data Migration</h1>
          <p className="text-gray-500 max-w-xl mx-auto">
            Transfer your Google Drive files, Contacts, and Calendar events from one Google Workspace account to another.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Source Account Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">1</span>
              Source Account
            </h2>
            
            {sourceUser ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-6">
                {sourceUser.picture ? (
                  <img src={sourceUser.picture} alt="Profile" className="w-16 h-16 rounded-full border-2 border-green-100" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold text-xl">
                    {sourceUser.name?.charAt(0) || sourceUser.email?.charAt(0)}
                  </div>
                )}
                <div className="text-center">
                  <p className="font-medium">{sourceUser.name}</p>
                  <p className="text-sm text-gray-500">{sourceUser.email}</p>
                </div>
                <div className="flex items-center gap-1 text-green-600 text-sm font-medium bg-green-50 px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4" /> Connected
                </div>
                <button 
                  onClick={() => handleLogout('source')}
                  className="text-sm text-gray-500 hover:text-red-600 flex items-center gap-1 mt-4 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Disconnect
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <p className="text-sm text-gray-500 text-center px-4">Connect the account you want to transfer data FROM.</p>
                <button
                  onClick={() => handleConnect('source')}
                  className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                  Connect Source
                </button>
              </div>
            )}
          </div>

          {/* Destination Account Card */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">2</span>
              Destination Account
            </h2>
            
            {destUser ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-6">
                {destUser.picture ? (
                  <img src={destUser.picture} alt="Profile" className="w-16 h-16 rounded-full border-2 border-blue-100" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
                    {destUser.name?.charAt(0) || destUser.email?.charAt(0)}
                  </div>
                )}
                <div className="text-center">
                  <p className="font-medium">{destUser.name}</p>
                  <p className="text-sm text-gray-500">{destUser.email}</p>
                </div>
                <div className="flex items-center gap-1 text-blue-600 text-sm font-medium bg-blue-50 px-3 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4" /> Connected
                </div>
                <button 
                  onClick={() => handleLogout('dest')}
                  className="text-sm text-gray-500 hover:text-red-600 flex items-center gap-1 mt-4 transition-colors"
                >
                  <LogOut className="w-4 h-4" /> Disconnect
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center space-y-4 py-8 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <p className="text-sm text-gray-500 text-center px-4">Connect the account you want to transfer data TO.</p>
                <button
                  onClick={() => handleConnect('dest')}
                  className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                  Connect Destination
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Transfer Options */}
        <div className={`bg-white p-6 rounded-2xl shadow-sm border border-gray-100 transition-opacity duration-300 ${sourceUser && destUser ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">3</span>
            Select Data to Transfer
          </h2>
          
          <div className="space-y-4 mb-8">
            <label className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={options.transferDrive}
                onChange={(e) => setOptions({...options, transferDrive: e.target.checked})}
                className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Database className="w-5 h-5 text-blue-500" />
                  Google Drive Files
                </div>
                <p className="text-sm text-gray-500 mt-1">Copies files you own to the destination account. (Note: Google Docs/Sheets require export, which is skipped in this prototype).</p>
              </div>
            </label>

            <label className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={options.transferContacts}
                onChange={(e) => setOptions({...options, transferContacts: e.target.checked})}
                className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Users className="w-5 h-5 text-green-500" />
                  Google Contacts
                </div>
                <p className="text-sm text-gray-500 mt-1">Copies your personal contacts (names, emails, phone numbers).</p>
              </div>
            </label>

            <label className="flex items-start gap-4 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
              <input 
                type="checkbox" 
                checked={options.transferCalendar}
                onChange={(e) => setOptions({...options, transferCalendar: e.target.checked})}
                className="mt-1 w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-medium">
                  <Calendar className="w-5 h-5 text-purple-500" />
                  Calendar Events
                </div>
                <p className="text-sm text-gray-500 mt-1">Copies upcoming events from your primary calendar.</p>
              </div>
            </label>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleTransfer}
              disabled={transferring || (!options.transferDrive && !options.transferContacts && !options.transferCalendar)}
              className="w-full md:w-auto px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {transferring ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Transferring...
                </>
              ) : (
                <>
                  Start Transfer
                  <ArrowRightLeft className="w-5 h-5" />
                </>
              )}
            </button>

            {transferStatus && (
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-gray-100 px-4 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 text-blue-600" />
                {transferStatus}
              </div>
            )}
          </div>
        </div>

        {/* Setup Instructions */}
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 text-sm text-blue-900">
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            OAuth Setup Required
          </h3>
          <p className="mb-2">To use this application, you must configure Google OAuth credentials:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Go to the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline font-medium">Google Cloud Console</a>.</li>
            <li>Create an OAuth 2.0 Client ID (Web application).</li>
            <li>Add these Authorized redirect URIs:
              <ul className="list-disc pl-5 mt-1 font-mono text-xs bg-white/50 p-2 rounded">
                <li>{window.location.origin}/auth/callback/source</li>
                <li>{window.location.origin}/auth/callback/dest</li>
              </ul>
            </li>
            <li>Enable the <strong>Google Drive API</strong>, <strong>Google People API</strong>, and <strong>Google Calendar API</strong> in your Google Cloud project.</li>
            <li>Add your <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the AI Studio Secrets panel.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
