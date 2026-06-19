import { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { NextResponse } from "next/server";
import { Jsonify } from "type-fest";

export type APIRouteReturn<
  T extends (...args: any[]) => Promise<NextResponse>,
> = Awaited<ReturnType<T>> extends NextResponse<infer R> ? Jsonify<R> : never;

export type QueryConfig<
  T extends (...args: any[]) => any,
  TData = Awaited<ReturnType<T>>,
> = Omit<
  UseQueryOptions<Awaited<ReturnType<T>>, Error, TData>,
  "queryKey" | "queryFn"
>;

export type MutationConfig<T extends (variables: any) => any> = Omit<
  UseMutationOptions<Awaited<ReturnType<T>>, Error, Parameters<T>[0]>,
  "mutationFn"
>;
