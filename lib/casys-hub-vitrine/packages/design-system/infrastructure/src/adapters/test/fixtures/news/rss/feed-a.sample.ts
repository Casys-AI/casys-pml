export default {
  items: [
    {
      guid: 'a-1',
      title: 'Article A1',
      link: 'https://news.example.com/a1',
      pubDate: '2024-02-03T10:00:00Z',
      'content:encoded': '<p>AI is trending <img src="https://img.example.com/a1.jpg"/></p>',
      contentSnippet: 'AI is trending',
      summary: 'AI is trending',
      categories: ['Tech', { _: 'AI' }, 'Tech'],
      'dc:creator': 'Alice',
    },
    {
      guid: 'a-2',
      title: 'Article A2',
      link: 'https://news.example.com/a2',
      pubDate: '2024-01-30T12:00:00Z',
      contentSnippet: 'Older content about sports',
      summary: 'Older content about sports',
      categories: ['Sports'],
      'dc:creator': 'Bob',
    },
  ],
} as const;
