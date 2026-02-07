export interface PodcastGeneratorPort {
  generatePodcast(text: string, language: string): Promise<{ url: string; duration: number }>; // url = chemin local ou remote
}
