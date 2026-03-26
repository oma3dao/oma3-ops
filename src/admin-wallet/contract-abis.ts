/**
 * Minimal contract ABI fragments for admin operations.
 * Only the functions needed by the propose scripts.
 */

export const RESOLVER_ABI = [
  'function addAuthorizedIssuer(address issuer)',
  'function removeAuthorizedIssuer(address issuer)',
  'function isIssuer(address) view returns (bool)',
  'function owner() view returns (address)',
];

export const REGISTRY_ABI = [
  'function setOwnershipResolver(address resolver)',
  'function setDataUrlResolver(address resolver)',
  'function setRegistrationResolver(address resolver)',
  'function setRequireDataUrlAttestation(bool required)',
  'function owner() view returns (address)',
];
