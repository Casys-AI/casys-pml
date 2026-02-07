export default {
  items: [
    {
      guid: 'b-1',
      title: 'Valid B1',
      link: 'https://news.example.com/b1',
      pubDate: '2024-02-02T09:00:00Z',
      contentSnippet: 'Something about AI and tech',
      summary: 'Something about AI and tech',
      categories: [{ _: 'AI' }, 'Tech'],
      creator: 'Bob',
    },
    {
      guid: 'b-no-title',
      // title missing
      link: 'https://news.example.com/b2',
      pubDate: '2024-02-02T08:00:00Z',
      contentSnippet: 'No title',
    },
    {
      guid: 'b-no-link',
      title: 'No link item',
      // link missing
      pubDate: '2024-02-02T07:00:00Z',
    },
    {
      guid: 'b-no-date',
      title: 'No date item',
      link: 'https://news.example.com/b3',
      // pubDate missing
    },
  ],
} as const;
