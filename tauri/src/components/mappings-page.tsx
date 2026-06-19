import * as React from "react"
import {
  Add01Icon,
  Delete02Icon,
  RestoreBinIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  cloneDefaultMappingRules,
  prioritizeMappingRules,
  validateMappingRules,
  type MappingRule,
} from "../lib/mappings"

type MappingsPageProps = {
  rules: MappingRule[]
  onSave: (rules: MappingRule[]) => void
}

function createMappingRule(): MappingRule {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `mapping-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    matchText: "",
    displayLabel: "",
    enabled: true,
    isDefault: false,
  }
}

export function MappingsPage({ rules, onSave }: MappingsPageProps) {
  const [draftRules, setDraftRules] = React.useState(() =>
    prioritizeMappingRules(rules)
  )
  const [saved, setSaved] = React.useState(false)
  const errors = validateMappingRules(draftRules)
  const hasErrors = Object.keys(errors).length > 0

  React.useEffect(() => {
    setDraftRules(prioritizeMappingRules(rules))
  }, [rules])

  const updateRule = React.useCallback(
    (id: string, update: Partial<MappingRule>) => {
      setSaved(false)
      setDraftRules((current) =>
        current.map((rule) => (rule.id === id ? { ...rule, ...update } : rule))
      )
    },
    []
  )

  return (
    <div className="page-stack">
      <section className="panel editor-intro">
        <div>
          <p className="section-kicker">Display rules</p>
          <h2>Make noisy window titles useful</h2>
          <p>
            Rules match the untouched window title without changing your
            collector or historical database rows. Custom mappings run first.
          </p>
        </div>
        <div className="editor-actions">
          <button
            className="button secondary header-button"
            type="button"
            onClick={() => {
              setSaved(false)
              setDraftRules(cloneDefaultMappingRules())
            }}
          >
            <HugeiconsIcon icon={RestoreBinIcon} strokeWidth={1.8} />
            Restore defaults
          </button>
          <button
            className="button primary header-button"
            type="button"
            onClick={() => {
              setSaved(false)
              setDraftRules((current) => [createMappingRule(), ...current])
            }}
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
            Add mapping
          </button>
        </div>
      </section>

      <section className="panel editor-panel">
        <div className="editor-table-heading mapping-grid">
          <span>Match text</span>
          <span>Display label</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>
        <div className="editor-list">
          {draftRules.map((rule) => (
            <div className="mapping-row mapping-grid" key={rule.id}>
              <label>
                <span className="sr-only">Match text</span>
                <input
                  className={`input ${
                    errors[rule.id]?.matchText ? "invalid" : ""
                  }`}
                  value={rule.matchText}
                  placeholder="Text found in the raw title"
                  onChange={(event) =>
                    updateRule(rule.id, {
                      matchText: event.currentTarget.value,
                    })
                  }
                />
                {errors[rule.id]?.matchText ? (
                  <span className="field-error">
                    {errors[rule.id]?.matchText}
                  </span>
                ) : null}
              </label>
              <label>
                <span className="sr-only">Display label</span>
                <input
                  className={`input ${
                    errors[rule.id]?.displayLabel ? "invalid" : ""
                  }`}
                  value={rule.displayLabel}
                  placeholder="Friendly activity label"
                  onChange={(event) =>
                    updateRule(rule.id, {
                      displayLabel: event.currentTarget.value,
                    })
                  }
                />
                {errors[rule.id]?.displayLabel ? (
                  <span className="field-error">
                    {errors[rule.id]?.displayLabel}
                  </span>
                ) : null}
              </label>
              <div className="mapping-status">
                <label className="switch compact">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    aria-label={`Enable ${rule.displayLabel || "mapping"}`}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        enabled: event.currentTarget.checked,
                      })
                    }
                  />
                  <span />
                </label>
                <span className={`rule-kind ${rule.isDefault ? "" : "custom"}`}>
                  {rule.isDefault ? "Built-in" : "Custom"}
                </span>
              </div>
              <button
                className="button icon-button danger-button"
                type="button"
                aria-label={`Delete ${rule.displayLabel || "mapping"}`}
                onClick={() => {
                  setSaved(false)
                  setDraftRules((current) =>
                    current.filter((candidate) => candidate.id !== rule.id)
                  )
                }}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.8} />
              </button>
            </div>
          ))}
        </div>
        <div className="editor-footer">
          <p aria-live="polite">
            {hasErrors
              ? "Resolve the highlighted mapping errors before saving."
              : saved
                ? "Mappings saved. Dashboard totals now use these labels."
                : `${draftRules.length} mapping rules ready.`}
          </p>
          <button
            className="button primary"
            type="button"
            disabled={hasErrors}
            onClick={() => {
              onSave(prioritizeMappingRules(draftRules))
              setSaved(true)
            }}
          >
            Save mappings
          </button>
        </div>
      </section>
    </div>
  )
}
