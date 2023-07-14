import type { Database } from '@/server/db'

import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { FriendshipStatusSchema } from '@/utils/server/friendship-schemas'
import { protectedProcedure } from '@/server/trpc/procedures'
import { router } from '@/server/trpc/router'
import {
  NonEmptyStringSchema,
  CountSchema,
  IdSchema,
} from '@/utils/server/base-schemas'

export const myFriendRouter = router({
  getById: protectedProcedure
    .input(
      z.object({
        friendUserId: IdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.connection().execute(async (conn) => {
        //todo: Question 4: Implement mutual friend count
        return conn
          .selectFrom('users as friends')
          .innerJoin('friendships', 'friendships.friendUserId', 'friends.id')
          .innerJoin(
            userTotalFriendCount(conn).as('userTotalFriendCount'),
            'userTotalFriendCount.userId',
            'friends.id'
          )
          .innerJoin(
            userMutualFriendCount(conn, input.friendUserId).as(
              'mutualFriendCount'
            ),
            'mutualFriendCount.userId',
            'friends.id'
          )
          .where('friendships.userId', '=', ctx.session.userId)
          .where('friendships.friendUserId', '=', input.friendUserId)
          .where(
            'friendships.status',
            '=',
            FriendshipStatusSchema.Values['accepted']
          )
          .select([
            'friends.id',
            'friends.fullName',
            'friends.phoneNumber',
            'totalFriendCount',
            'mutualFriendCount',
          ])
          .executeTakeFirstOrThrow(() => new TRPCError({ code: 'NOT_FOUND' }))
          .then(
            z.object({
              id: IdSchema,
              fullName: NonEmptyStringSchema,
              phoneNumber: NonEmptyStringSchema,
              totalFriendCount: CountSchema,
              mutualFriendCount: CountSchema,
            }).parse
          )
      })
    }),
})

const userTotalFriendCount = (db: Database) => {
  return db
    .selectFrom('friendships')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .select((eb) => [
      'friendships.userId',
      'friendships.friendUserId',
      eb.fn.count('friendships.friendUserId').as('totalFriendCount'),
    ])
    .groupBy('friendships.userId')
}

//todo: Make a separate query to count the number of mutual friends
const userMutualFriendCount = (db: Database, userId: number) => {
  return db
    .selectFrom('friendships')
    .innerJoin('users as friends', 'friendships.friendUserId', 'friends.id')
    .where('friendships.status', '=', FriendshipStatusSchema.Values['accepted'])
    .where('friendships.userId', '=', userId)
    .where('friends.id', '!=', userId)
    .where(
      'friendships.friendUserId',
      'in',
      db
        .selectFrom('friendships')
        .select('friendships.friendUserId')
        .where('userId', '=', userId)
        .where('status', '=', FriendshipStatusSchema.Values['accepted'])
    )
    .select((eb) => [
      'friendships.userId',
      'friendships.friendUserId',
      eb.fn.count('friendships.friendUserId').as('mutualFriendCount'),
    ])
    .groupBy(['friendships.userId', 'friendships.friendUserId'])
}
