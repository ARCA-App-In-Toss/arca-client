export const queryKeys = {
  owner: (ownerScope: string) => ['arca', ownerScope] as const,
  today: (ownerScope: string, accountScope: string) => ['arca', ownerScope, accountScope, 'today'] as const,
  member: (ownerScope: string, accountScope: string) => ['arca', ownerScope, accountScope, 'member'] as const,
  policies: (ownerScope: string) => ['arca', ownerScope, 'policies'] as const,
  answer: (ownerScope: string, accountScope: string, answerId: string) =>
    ['arca', ownerScope, accountScope, 'answer', answerId] as const,
};
