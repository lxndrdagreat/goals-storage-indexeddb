import {GoalsIndexedDbDatabase} from './goals-database';
import {
  calculateDaysBetweenTwoDates, calculateWeeksBetweenTwoDates,
  CompletionModel, dateStart, GoalCompletionScore,
  GoalModel,
  GoalNotFoundError,
  GoalOccurrence,
  GoalStorageService,
  GoalUpsertData, weekStart
} from 'goals-core';

export class GoalsIndexedDBService extends GoalStorageService {

  private database: GoalsIndexedDbDatabase;

  constructor() {
    super();
    this.database = new GoalsIndexedDbDatabase();
  }

  async getGoals(): Promise<GoalModel[]> {
    return (await this.database.goals.toArray()).map(data => GoalModel.fromJSON(data as unknown as Record<string, string | number | Date>));
  }

  async deleteGoal(goalId: number): Promise<void> {
    await this.database.goals.delete(goalId);
    // delete all related completions
    await this.database.completions.where('goal').equals(goalId).delete();
  }

  async getGoalCompletions(goalId: number): Promise<CompletionModel[]> {
    return this.database.completions.where('goal').equals(goalId).toArray() as unknown as CompletionModel[];
  }

  async getGoalById(goalId: number): Promise<GoalModel> {
    const goalData = await this.database.goals.get(goalId);
    if (!goalData) {
      throw new GoalNotFoundError(`No goal found for id "${goalId}".`);
    }
    return GoalModel.fromJSON(goalData as unknown as Record<string, string | number | Date>);
  }

  async getGoalsByOccurrence(occurrence: GoalOccurrence): Promise<GoalModel[]> {
    const goals = await this.database.goals.where('occurs').equals(occurrence).toArray();
    return goals.map(goalData => GoalModel.fromJSON(goalData as unknown as Record<string, string | number | Date>));
  }

  async isGoalCompleted(goalId: number): Promise<[false, -1] | [true, number]> {
    try {
      const completion = await this.database.completions.where('goal').equals(goalId).last();
      if (!completion) {
        return [false, -1];
      }
      const goal = await this.getGoalById(goalId);
      if (goal.hasOccurred(completion.dateCompleted)) {
        return [true, completion.id as number];
      }
      return [false, -1];
    } catch (e) {
      return [false, -1];
    }
  }

  async toggleGoalCompletion(goalId: number, completionDate: Date = new Date()): Promise<boolean> {
    const [completed, completionId] = await this.isGoalCompleted(goalId);
    if (completed) {
      // unmark it
      await this.database.completions.delete(completionId);
      return false;
    } else {
      // mark it
      await this.database.completions.add({
        goal: goalId,
        dateCompleted: completionDate
      });
      return true;
    }
  }

  async upsertGoal(goalData: GoalUpsertData): Promise<GoalModel> {
    const id = await this.database.goals.put(goalData);
    return GoalModel.fromJSON({
      ...goalData,
      id: id
    });
  }

  async getGoalsWithCompleted(): Promise<[GoalModel, boolean][]> {
    const goals = await this.getGoals();
    return await Promise.all<[GoalModel, boolean]>(goals.map(async goal => {
      const [complete] = await this.isGoalCompleted(goal.id);
      return [
        goal,
        complete
      ];
    }));
  }

  async getGoalCompletionScore(goal: GoalModel): Promise<GoalCompletionScore> {
    const rightNow = new Date().getTime();

    const completionCount = await this.database.completions
      .where('goal')
      .equals(goal.id)
      .filter(completion => {
        if (goal.occursDaily) {
          // daily goals
          return Math.ceil(
            Math.abs(rightNow - completion.dateCompleted.getTime())
            / (1000 * 3600 * 24)
          ) <= 14;
        } else {
          // weekly goals (6 weeks)
          return Math.ceil(
            Math.abs(rightNow - completion.dateCompleted.getTime())
            / (1000 * 3600 * 24)
          ) <= 42;
        }
      })
      .count();

    const chances = Math.max(
      1,
      goal.occursDaily
        ? Math.min(
        14,
        calculateDaysBetweenTwoDates(dateStart(new Date()), dateStart(goal.dateAdded)))
        : goal.occursWeekly
        ? Math.min(
          6,
          calculateWeeksBetweenTwoDates(weekStart(new Date()), weekStart(goal.dateAdded)) + 1)
        : 0
    );
    if (completionCount === 0) {
      return {
        rate: 0,
        completions: 0,
        possible: chances
      };
    }
    return {
      rate: completionCount / chances,
      completions: completionCount,
      possible: chances
    };
  }
}
