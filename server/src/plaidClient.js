import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';

const env = process.env.PLAID_ENV || 'sandbox';

// One shared Plaid client. Credentials come from env vars and stay on the server.
export const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[env], // sandbox | production
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);
