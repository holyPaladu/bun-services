export interface HashRepository {
  hash(password: string): Promise<string>
  verify(password: string, hash: string): Promise<boolean>
}