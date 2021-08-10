import {Modal, Table} from 'react-bootstrap';
import React, {useState} from 'react';
import {connect} from "react-redux";
import transactions from "../../../utils/transactions";
import {useTranslation} from "react-i18next";
import helper from "../../../utils/helper";

const ModalViewDelegationDetails = (props) => {
    const {t} = useTranslation();
    const [show, setShow] = useState(false);
    const handleClose = () => {
        setShow(false);
    };
    const handleModal = () => {
        setShow(true);
    };
    let addressTruncate;

    return (
        <>
            <Modal
                animation={false}
                centered={true}
                show={show}
                backdrop="static"
                size="lg"
                className="modal-custom list-modal delegate-list-modal"
                onHide={handleClose}>
                <Modal.Header className="result-header" closeButton>
                    <h3 className="heading">
                        {t("VIEW_DELEGATIONS")}
                    </h3>
                </Modal.Header>
                <Modal.Body className="list-modal-body">
                    <ul className="modal-list-data">
                        <Table borderless hover responsive>
                            <thead>
                                <tr>
                                    <th>{t("MONIKER")}</th>
                                    <th>{t("VALIDATOR_ADDRESS")}</th>
                                    <th>{t("AMOUNT")}</th>
                                    <th>{t("STATUS")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {props.validatorsList ?
                                    props.validatorsList.map((delegation, index) => {
                                        addressTruncate = helper.stringTruncate(delegation.data.operatorAddress);
                                        return (
                                            <tr key={index}>
                                                <td>{delegation.data.description.moniker}
                                                </td>
                                                <td><span>{addressTruncate}</span></td>
                                                <td><span className="amount">{(transactions.XprtConversion(delegation.delegations*1)).toLocaleString()} XPRT</span></td>
                                                <td>     {helper.isActive(delegation.data) ?
                                                    <span className="active-icon-box" title="active">
                                                            active
                                                    </span>
                                                    :
                                                    <span className="inactive-icon-box" title="Inactive">
                                                            Inactive
                                                    </span>
                                                }</td>
                                            </tr>
                                        );

                                    }) : null
                                }
                            </tbody>
                        </Table>

                    </ul>
                    {/*<div className="unbonding-schedule-list-header delegations-list-header">*/}
                    {/*    <p>{t("MONIKER")}</p>*/}
                    {/*    <p>{t("VALIDATOR_ADDRESS")}</p>*/}
                    {/*    <p>{t("AMOUNT")}</p>*/}
                    {/*</div>*/}

                    {/*<div className="delegations-list unbonding-schedule-list" key={index}>*/}
                    {/*    <p>{delegation.data.description.moniker}</p>*/}
                    {/*    <p> <div className="address" title={delegation.data.operatorAddress}><span>{addressTruncate}</span></div></p>*/}
                    {/*    <p><span className="amount">{transactions.XprtConversion(delegation.delegations*1)} XPRT</span></p>*/}
                    {/*    /!*<p><span className="date">{moment(new Date (entry["completionTime"]).toString()).format('dddd MMMM Do YYYY, h:mm:ss a')}</span></p>*!/*/}
                    {/*</div>*/}

                </Modal.Body>
            </Modal>
            <span className="view-button" onClick={handleModal} title="View Unbonding XPRT Schedule">{t("VIEW")}</span>
        </>

    );
};


const stateToProps = (state) => {
    console.log(state.validators.delegatedValidators);
    return {
        validatorsList: state.validators.delegatedValidators,
    };
};


export default connect(stateToProps)(ModalViewDelegationDetails);

