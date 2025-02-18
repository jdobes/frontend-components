import React from 'react';
import propTypes from 'prop-types';
import * as remediationsApi from '@redhat-cloud-services/frontend-components-remediations/remediationsApi';
import ComplianceRemediationButton from './ComplianceRemediationButton';
import { CheckIcon, CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';
import routerParams from '@redhat-cloud-services/frontend-components-utilities/files/RouterParams';
import { EmptyTable, SimpleTableFilter, TableToolbar } from '@redhat-cloud-services/frontend-components';
import { Table, TableHeader, TableBody, sortable, SortByDirection } from '@patternfly/react-table';
import {
    Bullseye,
    Checkbox,
    EmptyState,
    EmptyStateBody,
    EmptyStateVariant,
    InputGroup,
    Level,
    LevelItem,
    Grid,
    GridItem,
    Stack,
    StackItem,
    Pagination,
    PaginationVariant,
    Text,
    TextContent,
    TextVariants,
    Title
} from '@patternfly/react-core';
import { RowLoader } from '@redhat-cloud-services/frontend-components-utilities/files/helpers';
import flatMap from 'lodash/flatMap';
import './compliance.scss';
import RulesComplianceFilter from './RulesComplianceFilter';
import debounce from 'lodash/debounce';
import includes from 'lodash/includes';

const emptyRows = [{
    cells: [{
        title: (
            <EmptyTable>
                <Bullseye>
                    <EmptyState variant={ EmptyStateVariant.full }>
                        <Title headingLevel="h5" size="lg">
                                No matching rules found
                        </Title>
                        <EmptyStateBody>
                                This filter criteria matches no rules. <br /> Try changing your filter settings.
                        </EmptyStateBody>
                    </EmptyState>
                </Bullseye>
            </EmptyTable>
        ),
        props: {
            colSpan: 5
        }
    }]
}];

import {
    REMEDIATIONS_COLUMN,
    COMPLIANT_COLUMN,
    SEVERITY_COLUMN,
    POLICY_COLUMN,
    TITLE_COLUMN,
    ANSIBLE_ICON,
    HIGH_SEVERITY,
    MEDIUM_SEVERITY,
    LOW_SEVERITY
} from './Constants';

class SystemRulesTable extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            columns: [
                { title: 'Rule', transforms: [ sortable ]},
                { title: 'Policy', transforms: [ sortable ]},
                { title: 'Severity', transforms: [ sortable ]},
                { title: 'Passed', transforms: [ sortable ]},
                { title: <React.Fragment>{ ANSIBLE_ICON } Ansible</React.Fragment> }
            ],
            page: 1,
            itemsPerPage: 10,
            rows: [],
            hidePassed: false,
            severity: [],
            policy: [],
            currentRows: [],
            refIds: {},
            profiles: {},
            sortBy: {}
        };

    }

    removeRefIdPrefix = (refId) => {
        const splitRefId = refId.toLowerCase().split('xccdf_org.ssgproject.content_profile_')[1];
        if (splitRefId) {
            return splitRefId;
        } else {
            // Sometimes the reports contain IDs like "stig-rhel7-disa" which we can pass
            // directly
            return refId;
        }
    }

    setInitialCurrentRows() {
        const { hidePassed, itemsPerPage } = this.state;
        const { profileRules, rows } = this.props;
        const rowsRefIds = this.rulesToRows(profileRules);
        this.currentRows(1, itemsPerPage, rowsRefIds).then((currentRows) => {
            this.setState(() => (
                {
                    currentRows,
                    originalRows: rowsRefIds.rows,
                    rows: rowsRefIds.rows,
                    profiles: rowsRefIds.profiles,
                    refIds: rowsRefIds.refIds
                }
            ));
            if (hidePassed) {
                this.filterBy(hidePassed, rows, COMPLIANT_COLUMN);
            }
        });
    }

    componentDidMount = () => {
        this.setInitialCurrentRows();
    }

    componentDidUpdate = (prevProps) => {
        if (this.props.profileRules !== prevProps.profileRules) {
            this.setInitialCurrentRows();
        }
    }

    changePage = (page, itemsPerPage) => {
        this.currentRows(page, itemsPerPage).then((currentRows) => {
            this.setState(() => (
                {
                    page,
                    itemsPerPage,
                    currentRows
                }
            ));
        });
    }

    setPage = (_event, page) => {
        const { itemsPerPage } = this.state;
        this.changePage(page, itemsPerPage);
    }

    setPerPage = (_event, itemsPerPage) => {
        const { page } = this.state;
        this.changePage(page, itemsPerPage);
    }

    isParent = (row) => {
        return row.hasOwnProperty('isOpen');
    }

    remediationAvailable = (remediationId) => {
        return remediationId ? <CheckIcon style={ { color: 'var(--pf-global--success-color--200)' } }/> : 'No';
    }

    currentRows = (page, itemsPerPage, rowsRefIds) => {
        const { rows, profiles, refIds } = (rowsRefIds) ? rowsRefIds : this.state;

        if (!rows.length) {
            // Avoid even making an empty request to the remediations API
            return Promise.resolve([]);
        }

        if (rows.length < itemsPerPage * 2) { itemsPerPage = rows.length / 2; }

        const firstIndex = (page - 1) * itemsPerPage * 2;
        const lastIndex = page * itemsPerPage * 2;
        const newRows = flatMap(rows.slice(firstIndex, lastIndex), ({ parent, ...row }) => ({
            ...row,
            ...(
                (parent || parent === 0) ? parent > itemsPerPage ?
                    { parent: parent % (itemsPerPage * 2) } :
                    { parent } :
                    {}
            )
        }));

        const ruleIds = newRows.filter(row => row.hasOwnProperty('isOpen'))
        .map(({ cells }) => `ssg:rhel7|${this.removeRefIdPrefix(profiles[cells[0].original])}|${refIds[cells[0].original]}`);

        return window.insights.chrome.auth.getUser()
        .then(() => {
            return remediationsApi.getResolutionsBatch(ruleIds).catch(e => newRows)
            .then(response => newRows.map(({ cells, ...row }) => ({
                ...row,
                cells: [
                    ...cells,
                    ...this.isParent(row, cells) ? [
                        {
                            title: this.remediationAvailable(
                                response[`ssg:rhel7|${this.removeRefIdPrefix(profiles[cells[0].original])}|${refIds[cells[0].original]}`]
                            ),
                            original: response[`ssg:rhel7|${this.removeRefIdPrefix(profiles[cells[0].original])}|${refIds[cells[0].original]}`]
                        }
                    ] : []
                ]
            })));
        });
    }

    selectAll = (rows, selected) => {
        return rows.map(row => (
            {
                ...row,
                ...this.isParent(row) ? { selected } : {}
            }
        ));
    }

    onSelect = (_event, selected, key) => {
        const { page, itemsPerPage } = this.state;
        let { currentRows, rows } = this.state;
        if (key === -1) {
            rows = this.selectAll(rows, selected);
            currentRows = this.selectAll(currentRows, selected);
        } else {
            // One rule was selected
            const index = ((page - 1) * itemsPerPage * 2) + Number(key);
            if (currentRows[index].cells[REMEDIATIONS_COLUMN].original) {
                rows[index].selected = selected;
                currentRows[key].selected = selected;
            }
        }

        this.setState({ rows, currentRows });
    }

    ruleTitleCell = (title, identifier) => <Stack>
        <StackItem>{ title }</StackItem>
        { identifier && <StackItem>
            <TextContent><Text component={ TextVariants.small }>{ identifier.label }</Text></TextContent>
        </StackItem> || '' }
    </Stack>

    calculateParent = ({ profile }, { title, severity, compliant, identifier }) => ({
        isOpen: false,
        cells: [
            { title: this.ruleTitleCell(title, identifier), original: title },
            { title: profile.name, original: profile.name },
            {
                title: (severity.toLowerCase() === 'high' ? HIGH_SEVERITY :
                    severity.toLowerCase() === 'medium' ? MEDIUM_SEVERITY :
                        severity.toLowerCase() === 'low' ? LOW_SEVERITY : severity),
                original: severity.toLowerCase()
            },
            {
                title: (compliant ? <CheckCircleIcon className='ins-u-passed' /> :
                    <ExclamationCircleIcon className='ins-u-failed' />),
                original: compliant
            }
        ]
    })

    conditionalLink = (children, href, additionalProps) => (
        href && <a href={ href } { ...additionalProps }>{ children }</a> || children
    )

    referencesList = (references) => references.reduce((acc, reference, i) => ([
        acc, ', ', this.conditionalLink(reference.label, reference.href, { target: '_blank', key: i + 1 })
    ]), this.conditionalLink(references[0].label, references[0].href, { target: '_blank', key: 0 }));

    calculateChild = ({ description, rationale, identifier, references }, key) => ({
        parent: key * 2,
        cells: [{
            title: (
                <React.Fragment key={ key }>
                    <div className='margin-top-lg'>
                        <Stack id={ `rule-description-${key}` } className='margin-bottom-lg'>
                            <StackItem style={ { marginBottom: 'var(--pf-global--spacer--sm)' } }>
                                <Text component={ TextVariants.h5 }><b>Description</b></Text>
                            </StackItem>
                            <StackItem isFilled>{ description }</StackItem>
                        </Stack>
                        <Stack id={ `rule-identifiers-references-${key}` } className='margin-bottom-lg'>
                            <Grid>
                                <GridItem span={ 2 }>
                                    <Text component={ TextVariants.h5 }><b>Identifier</b></Text>
                                    <Text>{ identifier && this.conditionalLink(identifier.label, identifier.system, { target: '_blank' }) }</Text>
                                </GridItem>

                                { references.length > 0 ? <GridItem span={ 10 }>
                                    <Text component={ TextVariants.h5 }><b>References</b></Text>
                                    <Text>{ this.referencesList(references) }</Text>
                                </GridItem> : '' }
                            </Grid>
                        </Stack>
                        { rationale &&
                        <Stack id={ `rule-rationale-${key}` } style={ { marginBottom: 'var(--pf-global--spacer--lg)' } }>
                            <StackItem style={ { marginBottom: 'var(--pf-global--spacer--sm)' } }>
                                <Text component={ TextVariants.h5 }><b>Rationale</b></Text>
                            </StackItem>
                            <StackItem isFilled>{ rationale }</StackItem>
                        </Stack>
                        }
                    </div>
                </React.Fragment>
            ) }]
    })

    rulesToRows = (profileRules) => {
        const refIds = {};
        const profiles = {};
        const rows = flatMap(profileRules, (profileRule) => flatMap(profileRule.rules, (rule, key) => {
            profiles[rule.title] = profileRule.profile.refId;
            refIds[rule.title] = rule.refId;
            return [
                this.calculateParent(profileRule, rule),
                this.calculateChild(rule, key)
            ];
        }));
        return { rows, refIds, profiles };
    }

    onCollapse = (_event, rowKey, isOpen) => {
        const { rows, profiles, refIds } = this.state;
        const key = ((this.state.page - 1) * this.state.itemsPerPage * 2) + Number(rowKey);
        rows[key].isOpen = isOpen;
        this.currentRows(this.state.page, this.state.itemsPerPage, { rows, profiles, refIds }).then((currentRows) => {
            this.setState(() => ({ rows, currentRows }));
        });
    }

    selectedRules = () => {
        const { currentRows, profiles, refIds } = this.state;
        return currentRows.filter(row => row.selected && row.cells[REMEDIATIONS_COLUMN].original).map(row => ({
            // We want to match this response with a similar response from GraphQL
            refId: refIds[row.cells[0].original],
            profiles: [{ refId: profiles[row.cells[0].original] }],
            title: row.cells[0].original // This is the rule title, the description is too long
        }));
    }

    // This takes both the row and its children (collapsible rows) and puts them into
    // one element. It is used only so that the rows can be compared.
    compressRows = (rows) => {
        const compressedRows = [];
        rows.forEach((row, i) => {
            if (row.hasOwnProperty('isOpen')) {
                compressedRows.push({ parent: row, child: rows[i + 1] });
            }
        });

        return compressedRows;
    }

    uncompressRows(compressedRows) {
        const originalRows = [];
        compressedRows.forEach((compressedRow, i) => {
            originalRows.push(compressedRow.parent);
            if (compressedRow.child) {
                let child = compressedRow.child;
                child.parent = i * 2;
                originalRows.push(child);
            }
        });
        return originalRows;
    }

    handleSearch = debounce(title => {
        const { hidePassed, severity, policy } = this.state;
        this.setState({
            title
        }, () => this.updateFilter(hidePassed, severity, policy));

    }, 500)

    onSort = (_event, index, direction) => {
        // Original index is not the right column, as patternfly adds 1 because
        // of the 'collapsible' button and 1 because of the checkbox.
        let column = index - 2;
        const { refIds, rows, page, profiles, itemsPerPage } = this.state;
        const sortedRows = this.uncompressRows(
            this.compressRows(rows).sort(
                (a, b) => {
                    if (direction === SortByDirection.asc) {
                        return String(a.parent.cells[column].original).localeCompare(String(b.parent.cells[column].original));
                    } else {
                        return -String(a.parent.cells[column].original).localeCompare(String(b.parent.cells[column].original));
                    }
                }
            )
        );
        this.currentRows(page, itemsPerPage, { rows: sortedRows, profiles, refIds }).then((currentRows) => {
            this.setState(() => ({
                currentRows,
                sortBy: {
                    index,
                    direction
                },
                rows: sortedRows
            }));
        });
    }

    filterBy = (attribute, rows, column) => {
        const filteredRows = [];
        rows.forEach((row, i) => {
            if (row.hasOwnProperty('isOpen') && String(row.cells[column].original).toLowerCase().match(
                String(attribute).toLowerCase()
            )) {
                filteredRows.push(row);
                if (!rows[i + 1].hasOwnProperty('isOpen')) {
                    let child = rows[i + 1];
                    child.parent = filteredRows.length - 1;
                    filteredRows.push(child);
                }
            }
        });

        return filteredRows;
    }

    filteredRows = (passedRows, severityRows, policyRows, titleRows, hidePassed, severity, policy, title) => {
        let result;

        if (severity.length > 0 && hidePassed) {
            result = passedRows.filter(row => severityRows.includes(row));
        } else if (hidePassed && severity.length === 0) {
            result = passedRows;
        } else if (severity.length > 0 && !hidePassed) {
            result = severityRows;
        } else {
            result = passedRows;
        }

        if (policy.length > 0 && result.length > 0) {
            result = result.filter(row => policyRows.includes(row));
        } else if (policy.length > 0 && result.length === 0) {
            result = policyRows;
        }

        if (title && title.length > 0 && result.length > 0) {
            result = result.filter(row => titleRows.includes(row));
        } else if (title && title.length > 0 && result.length === 0) {
            result = titleRows;
        }

        return result;
    }

    updateFilter = (hidePassed, severity, policy) => {
        const { originalRows, profiles, refIds, page, itemsPerPage, title } = this.state;
        let passedRows;
        if (hidePassed) {
            passedRows = this.filterBy(!hidePassed, originalRows, COMPLIANT_COLUMN);
        } else {
            passedRows = originalRows;
        }

        const severityRows = this.filterBy(severity.join('|'), originalRows, SEVERITY_COLUMN);
        const policyRows = this.filterBy(policy, originalRows, POLICY_COLUMN);
        const titleRows = this.filterBy(title, originalRows, TITLE_COLUMN);
        const filteredRows = this.filteredRows(passedRows, severityRows, policyRows, titleRows,
            hidePassed, severity, policy, title);

        this.currentRows(
            page,
            itemsPerPage,
            {
                rows: filteredRows, profiles, refIds
            }
        ).then((currentRows) => {
            this.setState(() => ({
                currentRows,
                rows: filteredRows,
                hidePassed,
                severity,
                policy,
                title
            }));
        });
    }

    render() {
        const { sortBy, rows, currentRows, columns, page, itemsPerPage } = this.state;
        const { system, loading, profileRules } = this.props;

        if (loading) {
            return (
                <Table
                    cells={ columns }
                    rows={ [ ...Array(10) ].map(() => ({
                        cells: [{
                            title: <RowLoader />,
                            colSpan: 5
                        }]
                    })) }>
                    <TableHeader />
                    <TableBody />
                </Table>
            );
        } else {
            /* eslint-disable camelcase */
            return (
                <React.Fragment>
                    <TableToolbar>
                        <Level gutter='md'>
                            <LevelItem>
                                <InputGroup>
                                    <RulesComplianceFilter
                                        availablePolicies={ profileRules.map(profile => profile.profile) }
                                        updateFilter={ this.updateFilter } />
                                    <SimpleTableFilter buttonTitle={ null }
                                        onFilterChange={ this.handleSearch }
                                        placeholder="Search by name" />
                                </InputGroup>
                            </LevelItem>
                            <LevelItem>
                                { rows.length / 2 } results
                            </LevelItem>
                            <LevelItem>
                                <ComplianceRemediationButton
                                    allSystems={ [{ id: system.id, rule_objects_failed: []}] }
                                    selectedRules={ this.selectedRules() } />
                            </LevelItem>
                        </Level>
                        <Pagination
                            page={ page }
                            itemCount={ rows.length / 2 }
                            dropDirection='down'
                            onSetPage={ this.setPage }
                            onPerPageSelect={ this.setPerPage }
                            perPage={ itemsPerPage }
                        />
                    </TableToolbar>
                    <Table
                        className='compliance-rules-table'
                        cells={ columns }
                        onCollapse={ this.onCollapse }
                        onSort={ this.onSort }
                        sortBy={ sortBy }
                        onSelect={ (currentRows.length !== 0) && this.onSelect }
                        rows={ (currentRows.length === 0) ? emptyRows : currentRows }>
                        <TableHeader />
                        <TableBody />
                    </Table>
                    <TableToolbar isFooter className="ins-c-inventory__table--toolbar">
                        <Pagination
                            page={ page }
                            itemCount={ rows.length / 2 }
                            dropDirection='up'
                            onSetPage={ this.setPage }
                            onPerPageSelect={ this.setPerPage }
                            perPage={ itemsPerPage }
                            variant={ PaginationVariant.bottom }
                        />
                    </TableToolbar>
                </React.Fragment>
            );
            /* eslint-enable camelcase */
        }
    }
}

SystemRulesTable.propTypes = {
    profileRules: propTypes.array,
    loading: propTypes.bool,
    hidePassed: propTypes.bool,
    severity: propTypes.array,
    rows: propTypes.array,
    system: propTypes.object
};

SystemRulesTable.defaultProps = {
    profileRules: [{ rules: []}]
};

export default routerParams(SystemRulesTable);
