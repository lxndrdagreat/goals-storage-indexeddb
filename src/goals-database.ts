import Dexie from 'dexie';

interface ICompletion {
  id?: number;
  goal: number;
  dateCompleted: Date;
}

interface IGoal {
  id?: number;
  occurs: number;
  dateAdded: Date;
  title: string;
}

export class GoalsIndexedDbDatabase extends Dexie {
  goals: Dexie.Table<IGoal, number>;
  completions: Dexie.Table<ICompletion, number>;

  constructor() {
    super('GoalsDB');
    this.version(1).stores({
      goals: '++id, occurs, dateAdded, title',
      completions: '++id, goal, dateCompleted'
    });
    // this.goals.mapToClass(GoalModel);
  }
}
