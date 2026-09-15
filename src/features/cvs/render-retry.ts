export async function withSingleRetry<T>(operation: () => Promise<T>, shouldRetry: (error: unknown) => boolean): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!shouldRetry(error)) throw error;
    return operation();
  }
}
