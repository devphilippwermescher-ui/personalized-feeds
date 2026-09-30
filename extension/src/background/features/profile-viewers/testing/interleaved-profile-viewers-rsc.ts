interface FixtureCard {
  id: string;
  username: string;
  displayName: string;
  headline: string;
  verticalPosition: number;
  viewedAgoText: string;
}

const cards: FixtureCard[] = [
  {
    id: 'a',
    username: 'rossor',
    displayName: 'Rostyslav Osinchuk',
    headline: 'Founder at Product Studio',
    verticalPosition: 24,
    viewedAgoText: 'Viewed 3w ago',
  },
  {
    id: 'b',
    username: 'kamalakar-vatala',
    displayName: 'Kamalakar Vatala',
    headline: 'Engineering Leader',
    verticalPosition: 25,
    viewedAgoText: 'Viewed 1mo ago',
  },
  {
    id: 'c',
    username: 'nadira-sultankulova',
    displayName: 'Nadira Sultankulova',
    headline: 'Product Designer',
    verticalPosition: 26,
    viewedAgoText: 'Viewed 1mo ago',
  },
  ...Array.from({ length: 9 }, (_, index): FixtureCard => ({
    id: (20 + index).toString(16),
    username: `verified-viewer-${index + 4}`,
    displayName: `Verified Viewer ${index + 4}`,
    headline: `Role ${index + 4}`,
    verticalPosition: 27 + index,
    viewedAgoText: 'Viewed 1mo ago',
  })),
];

function record(id: string, value: unknown): string {
  return `${id}:${JSON.stringify(value)}`;
}

function cardRecord(card: FixtureCard): unknown {
  return [
    '$',
    'div',
    null,
    {
      'data-viewer-card': true,
      children: [
        `$L${card.id}1`,
        `$L${card.id}2`,
        `$L${card.id}3`,
        `$L${card.id}4`,
        `$L${card.id}5`,
      ],
    },
  ];
}

const definitions: string[] = [];

// Deliberately emit another person's name and avatar immediately after
// Rostyslav's URL. Definition order is not rendered-card order.
definitions.push(
  record('a1', { navigationUrl: 'https://www.linkedin.com/in/rossor/' }),
  record('d2', { children: [null, 'Volodymyr Korol'] }),
  record('d5', {
    a11yText: 'Volodymyr Korol',
    shape: 'circle',
    renderPayload: {
      rootUrl: 'https://media.licdn.com/dms/image/v2/volodymyr/profile-displayphoto-shrink_',
      imageRenditions: [{ width: 100, height: 100, suffixUrl: '100_100/photo?e=4102444800' }],
      assetUrn: 'urn:li:digitalmediaAsset:volodymyr',
    },
  }),
  record('d1', { navigationUrl: 'https://www.linkedin.com/in/volodymyr-korol/' })
);

// Emit Nadira's definitions before Kamalakar's while the root below renders
// Kamalakar first. Both cards share the same coarse relative time.
[cards[2], cards[1], cards[0], ...cards.slice(3)].forEach((card) => {
  definitions.push(
    record(`${card.id}1`, { navigationUrl: `https://www.linkedin.com/in/${card.username}/` }),
    record(`${card.id}2`, { children: [null, card.displayName] }),
    record(`${card.id}3`, { children: [card.headline, card.viewedAgoText] }),
    record(`${card.id}4`, {
      $type: 'proto.sdui.common.SemanticPosition',
      verticalPosition: card.verticalPosition,
    }),
    record(`${card.id}5`, {
      a11yText: card.displayName,
      shape: 'circle',
      renderPayload: {
        rootUrl: `https://media.licdn.com/dms/image/v2/${card.id}/profile-displayphoto-shrink_`,
        imageRenditions: [{ width: 100, height: 100, suffixUrl: '100_100/photo?e=4102444800' }],
        assetUrn: `urn:li:digitalmediaAsset:${card.id}`,
      },
    }),
    record(card.id, cardRecord(card))
  );
});

definitions.push(
  record('d3', { children: ['Platform Engineer', 'Viewed 1mo ago'] }),
  record('d4', {
    $type: 'proto.sdui.common.SemanticPosition',
    verticalPosition: 99,
  }),
  record('d', [
    '$',
    'div',
    null,
    { children: ['$Ld1', '$Ld2', '$Ld3', '$Ld4', '$Ld5'] },
  ]),
  record('0', [
    '$',
    'main',
    null,
    { children: cards.map((card) => `$L${card.id}`) },
  ])
);

export const INTERLEAVED_PROFILE_VIEWERS_RSC_FIXTURE = definitions.join('\n');
