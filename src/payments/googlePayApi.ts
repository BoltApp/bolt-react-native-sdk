import type { GooglePayAPMConfigResponse } from './types';

/**
 * Fetch Google Pay configuration from Bolt's API.
 * The config includes tokenization spec, merchant ID, and merchant name
 * so the developer doesn't need to provide them.
 *
 * Extracted into its own module so it can be imported and tested independently
 * of the platform-specific GoogleWallet component files.
 */
export const fetchGooglePayAPMConfig = async (
  apiUrl: string,
  headers: Record<string, string>
): Promise<GooglePayAPMConfigResponse> => {
  const response = await fetch(`${apiUrl}/v1/apm_config/googlepay`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Pay config: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
};
