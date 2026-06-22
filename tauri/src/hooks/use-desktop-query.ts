import * as React from "react"

export function useDesktopQuery<T>(
  loader: () => Promise<T>,
  dependencies: React.DependencyList,
  scopeKey: string
) {
  const [state, setState] = React.useState<{
    data: T | null
    error: string | null
    updatedAt: Date | null
    loading: boolean
    refreshing: boolean
    scopeKey: string | null
  }>({
    data: null,
    error: null,
    updatedAt: null,
    loading: true,
    refreshing: false,
    scopeKey: null,
  })

  React.useEffect(() => {
    let cancelled = false

    setState((current) =>
      current.scopeKey === scopeKey && current.data !== null
        ? {
            ...current,
            error: null,
            loading: false,
            refreshing: true,
          }
        : {
            data: null,
            error: null,
            updatedAt: null,
            loading: true,
            refreshing: false,
            scopeKey,
          }
    )

    void loader()
      .then((data) => {
        if (cancelled) {
          return
        }
        setState({
          data,
          error: null,
          updatedAt: new Date(),
          loading: false,
          refreshing: false,
          scopeKey,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        setState((current) => ({
          ...current,
          error:
            error instanceof Error
              ? error.message
              : "The desktop data could not be loaded.",
          loading: false,
          refreshing: false,
        }))
      })

    return () => {
      cancelled = true
    }
  }, dependencies)

  if (state.scopeKey !== scopeKey) {
    return {
      data: null,
      error: null,
      updatedAt: null,
      loading: true,
      refreshing: false,
    }
  }

  return {
    data: state.data,
    error: state.error,
    updatedAt: state.updatedAt,
    loading: state.loading,
    refreshing: state.refreshing,
  }
}
