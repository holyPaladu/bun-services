export type AccessTokenIdentity = Readonly<{
  accountId: string
  sessionId: string
}>

export type IssuedAccessToken = Readonly<{
  token: string
  expiresIn: number
}>

export interface AccessTokenSigner {
  sign(identity: AccessTokenIdentity): Promise<IssuedAccessToken>
}
