export interface RefreshTokenRepository {
  generate(): string
  hash(token: string): Promise<string>
  createId(): string
}
