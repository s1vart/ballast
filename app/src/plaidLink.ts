import { create, open, LinkSuccess, LinkExit } from 'react-native-plaid-link-sdk';
import { getLinkToken, exchangePublicToken } from './api';
import { CLIENT_USER_ID } from './config';

/**
 * Opens Plaid Link, then exchanges the resulting public_token on the backend.
 *
 * ⚠️ Uses a native module — this will NOT run in Expo Go. You need a
 * development build (see README: `npx expo prebuild` + `npx expo run:android`).
 */
export function connectBank(): Promise<{ item_id: string; institution: string | null }> {
  return new Promise((resolve, reject) => {
    getLinkToken(CLIENT_USER_ID)
      .then((linkToken) => {
        // Preload Link, then open it.
        create({ token: linkToken });
        open({
          onSuccess: (success: LinkSuccess) => {
            // success.publicToken is short-lived; exchange it server-side immediately.
            exchangePublicToken(success.publicToken).then(resolve).catch(reject);
          },
          onExit: (exit: LinkExit) => {
            const err = exit.error as { errorMessage?: string; message?: string } | undefined;
            if (err) reject(new Error(err.errorMessage ?? err.message ?? 'Link error'));
            else reject(new Error('cancelled'));
          },
        });
      })
      .catch(reject);
  });
}
