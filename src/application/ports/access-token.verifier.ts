export type AuthContext = Readonly<{
  accountId: string
  sessionId: string
  tokenId: string
}>

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthContext>
}
