import * as React from "react"

export function useDesktopQuery<T>(
  loader: () => Promise<T>,
  dependencies: React.DependencyList
) {
  const [state, setState] = React.useState<{
    data: T | null
    error: string | null
    updatedAt: Date | null
    loading: boolean
  }>({
    data: null,
    error: null,
    updatedAt: null,
    loading: true,
  })

  React.useEffect(() => {
    let cancelled = false

    setState((current) => ({
      ...current,
      error: null,
      loading: current.data === null,
    }))

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
        }))
      })

    return () => {
      cancelled = true
    }
  }, dependencies)

  return state
}
